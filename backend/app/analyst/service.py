"""One turn of the conversation, streamed stage by stage.

A turn is a message, an edit made in the findings panel, or a request to run the
analysis again. Each one updates the invention, then re-runs only the stages whose
inputs changed: a new ingredient re-checks products, knowledge and prior art; a
described process re-runs the assessment alone. The stage events carry the time
each stage actually took, and whether it ran or was reused.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Iterator

from pydantic import BaseModel, Field

from app.analyst import dialogue
from app.analyst.assess import assess, ip_options, next_steps
from app.analyst.evidence import ProductSet, check_knowledge, find_products, search_prior_art
from app.analyst.lexicon import use_terms
from app.analyst.model_reader import ReadFn
from app.analyst.models import (
    Amount,
    Analysis,
    Conversation,
    ConversationSummary,
    DialogueState,
    Ingredient,
    Invention,
    Message,
    RunSummary,
)
from app.analyst.reader import ItemInput, Reading, match_existing, read
from app.analyst.store import AnalystStore
from app.analyst.vocabulary import Vocabulary, fold
from app.core.errors import ApiError

STAGES = ("understand", "extract", "products", "knowledge", "prior_art", "compare", "assess")
MASS_UNITS = {"g": 1.0, "mg": 0.001, "kg": 1000.0}


class EditedIngredient(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    percent: float | None = Field(default=None, ge=0, le=100)
    amount_value: float | None = Field(default=None, ge=0)
    amount_unit: str | None = Field(default=None, max_length=8)
    purpose: str | None = Field(default=None, max_length=200)


class InventionEdit(BaseModel):
    ingredients: list[EditedIngredient] | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=120)
    intended_use: str | None = Field(default=None, max_length=600)
    problem: str | None = Field(default=None, max_length=600)


def _fingerprint(payload: object) -> str:
    return hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _pct(value: float | None) -> str:
    if value is None:
        return "no quantity"
    return f"{int(value) if float(value).is_integer() else value}%"


def _quantity(ingredient: Ingredient) -> str:
    if ingredient.percent is not None:
        return _pct(ingredient.percent)
    if ingredient.amount is not None:
        value = ingredient.amount.value
        return f"{int(value) if value.is_integer() else value} {ingredient.amount.unit}"
    return "no quantity"


def build_ingredient(item: ItemInput, vocabulary: Vocabulary) -> Ingredient:
    term = vocabulary.recognise(item.name)
    return Ingredient(
        key=term.id if term else "custom:" + fold(item.name),
        name=item.name,
        vocabulary_id=term.id if term else None,
        label=term.label if term else None,
        kind=term.kind if term else "unrecognised",
        amount=item.amount,
        percent=item.percent,
        purpose=item.purpose,
    )


def derive_percentages(invention: Invention) -> None:
    for ingredient in invention.ingredients:
        ingredient.percent_derived = None
    if not invention.ingredients or all(i.percent is not None for i in invention.ingredients):
        return
    grams = []
    for ingredient in invention.ingredients:
        if ingredient.amount is None or ingredient.amount.unit not in MASS_UNITS:
            return
        grams.append(ingredient.amount.value * MASS_UNITS[ingredient.amount.unit])
    total = sum(grams)
    if total <= 0:
        return
    for ingredient, weight in zip(invention.ingredients, grams, strict=True):
        if ingredient.percent is None:
            ingredient.percent_derived = round(weight / total * 100, 2)


def apply_reading(reading: Reading, invention: Invention, vocabulary: Vocabulary) -> list[str]:
    changes: list[str] = []
    if reading.replace_composition and reading.upsert:
        invention.ingredients = []
        seen: dict[str, Ingredient] = {}
        for item in reading.upsert:
            built = build_ingredient(item, vocabulary)
            if built.key in seen:
                continue
            seen[built.key] = built
            invention.ingredients.append(built)
        total = sum(i.percent or 0 for i in invention.ingredients)
        changes.append(
            f"{len(invention.ingredients)} ingredients captured, adding up to {_pct(round(total, 2))}"
        )
    else:
        for key in reading.remove:
            for ingredient in list(invention.ingredients):
                if ingredient.key == key:
                    invention.ingredients.remove(ingredient)
                    changes.append(f"Removed {ingredient.name}")
        for item in reading.upsert:
            existing = match_existing(item.name, invention, vocabulary)
            if existing is None:
                built = build_ingredient(item, vocabulary)
                if (
                    item.percent is None
                    and item.amount is None
                    and item.purpose
                    and not reading.upsert[0].percent
                ):
                    pass
                invention.ingredients.append(built)
                changes.append(f"Added {built.name} ({_quantity(built)})")
                continue
            before = _quantity(existing)
            if item.percent is not None:
                existing.percent = item.percent
            if item.amount is not None:
                existing.amount = item.amount
            after = _quantity(existing)
            if before != after:
                changes.append(f"{existing.name}: {before} → {after}")
            if item.purpose and item.purpose != existing.purpose:
                existing.purpose = item.purpose
                changes.append(f"Purpose of {existing.name}: {item.purpose}")

    labels = {
        "title": "Title", "problem": "Technical problem", "evidence": "Test results",
        "brand_name": "Brand name", "packaging_note": "Packaging", "region_note": "Origin",
    }  # fmt: skip
    for field, value in reading.fields.items():
        if field == "intended_use":
            text = str(value)
            if invention.intended_use and text in invention.intended_use:
                continue
            invention.intended_use = (
                f"{invention.intended_use} {text}".strip() if invention.intended_use else text
            )
            invention.use_terms = use_terms(invention.intended_use)
            changes.append("Intended use noted")
        elif field in ("form", "category", "invention_type"):
            if getattr(invention, field) != value:
                setattr(invention, field, value)
                if field == "form":
                    changes.append(f"Product type: {dialogue.form_label(str(value))}")
        elif field == "batch_size":
            invention.batch_size = value if isinstance(value, Amount) else None
        elif field == "title":
            if not invention.title:
                invention.title = str(value)
                changes.append(f"Title: {value}")
        elif field == "disclosure":
            if invention.disclosure != value:
                invention.disclosure = value  # type: ignore[assignment]
                changes.append(
                    "Disclosure: " + ("already public" if value == "public" else "not yet public")
                )
        elif getattr(invention, field, None) != value:
            setattr(invention, field, value)
            changes.append(
                f"{labels.get(field, field)} noted"
                if field != "brand_name"
                else f"Brand name: {value}"
            )

    new_steps = [s for s in reading.add_steps if s and s not in invention.process_steps]
    if new_steps:
        invention.process_steps.extend(new_steps)
        changes.append(
            f"{len(new_steps)} preparation step{'s' if len(new_steps) > 1 else ''} noted"
        )
    invention.process_parameters.extend(
        p for p in reading.add_parameters if p not in invention.process_parameters
    )
    new_features = [f for f in reading.add_features if f not in invention.distinctive_features]
    if new_features:
        invention.distinctive_features.extend(new_features)
        changes.append("What is new: noted")

    derive_percentages(invention)
    if changes:
        invention.version += 1
    return changes


def apply_edit(edit: InventionEdit, invention: Invention, vocabulary: Vocabulary) -> list[str]:
    changes: list[str] = []
    if edit.ingredients is not None:
        before = {i.key: i for i in invention.ingredients}
        rebuilt = []
        for row in edit.ingredients:
            amount = (
                Amount(value=row.amount_value, unit=row.amount_unit or "g")
                if row.amount_value is not None
                else None
            )
            built = build_ingredient(
                ItemInput(
                    name=row.name.strip(),
                    amount=amount,
                    percent=row.percent,
                    purpose=row.purpose or None,
                ),
                vocabulary,
            )
            old = before.pop(built.key, None)
            if old is None:
                changes.append(f"Added {built.name} ({_quantity(built)})")
            elif _quantity(old) != _quantity(built):
                changes.append(f"{built.name}: {_quantity(old)} → {_quantity(built)}")
            rebuilt.append(built)
        changes.extend(f"Removed {old.name}" for old in before.values())
        invention.ingredients = rebuilt
    for field in ("title", "intended_use", "problem"):
        value = getattr(edit, field)
        if value is not None and value.strip() != (getattr(invention, field) or ""):
            setattr(invention, field, value.strip() or None)
            changes.append(f"{field.replace('_', ' ').capitalize()} edited")
            if field == "intended_use":
                invention.use_terms = use_terms(invention.intended_use)
    derive_percentages(invention)
    if changes:
        invention.version += 1
    return changes


def title_for(invention: Invention) -> str:
    if invention.title:
        return invention.title[:80]
    if invention.ingredients:
        names = ", ".join(i.name for i in invention.ingredients[:3])
        return f"{dialogue.form_label(invention.form).capitalize()}: {names}"[:80]
    return "New invention"


class AnalystService:
    def __init__(
        self,
        store: AnalystStore,
        records,
        vocabulary: Vocabulary,
        products: ProductSet,
        reader: ReadFn | None = None,
    ) -> None:
        # The rules unless a model reader is handed in; see `model_reader.build_reader`.
        self.read_message: ReadFn = reader or (
            lambda message, invention, last: (read(message, invention, last, vocabulary), "rules")
        )
        self.engine = getattr(reader, "engine", "rules")
        self.store = store
        self.records = records
        self.vocabulary = vocabulary
        self.products = products

    # -- reading -----------------------------------------------------------

    def status(self) -> dict:
        records = self.records.status()
        return {
            "engine": self.engine,
            "products": {
                "count": len(self.products.products),
                "retrieved_at": self.products.retrieved_at,
            },
            "records": {"available": records.available, "count": records.record_count},
            "traditional_reference": self.vocabulary.traditional_count,
        }

    def conversations(self, username: str) -> list[ConversationSummary]:
        return [ConversationSummary(**row) for row in self.store.list(username)]

    def create(self, username: str) -> Conversation:
        conversation_id = self.store.create(
            username, Invention().model_dump(), DialogueState().model_dump()
        )
        self.store.add_message(
            conversation_id,
            "assistant",
            dialogue.GREETING,
            {"suggestions": ["I developed a face-pack formulation."]},
        )
        return self.get(username, conversation_id)

    def get(self, username: str, conversation_id: str) -> Conversation:
        row = self.store.load(username, conversation_id)
        if row is None:
            raise ApiError("unknown_conversation", "No such analysis for this account.", 404)
        invention = Invention(**row["invention"])
        state = DialogueState(**row["state"])
        missing = dialogue.missing(invention, state)
        return Conversation(
            engine=self.engine,
            id=row["id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            invention=invention,
            messages=[Message(**m) for m in self.store.messages(conversation_id)],
            analysis=Analysis(**row["analysis"]) if row["analysis"] else None,
            missing=missing,
            ready=dialogue.is_ready(missing),
            history=[RunSummary(**r) for r in self.store.runs(conversation_id)],
        )

    def delete(self, username: str, conversation_id: str) -> None:
        if not self.store.delete(username, conversation_id):
            raise ApiError("unknown_conversation", "No such analysis for this account.", 404)

    # -- one turn ----------------------------------------------------------

    def turn(
        self,
        username: str,
        conversation_id: str,
        *,
        text: str | None = None,
        edit: InventionEdit | None = None,
        rerun: bool = False,
    ) -> Iterator[dict]:
        row = self.store.load(username, conversation_id)
        if row is None:
            raise ApiError("unknown_conversation", "No such analysis for this account.", 404)
        invention = Invention(**row["invention"])
        state = DialogueState(**row["state"])
        analysis = Analysis(**row["analysis"]) if row["analysis"] else None

        started = time.perf_counter()

        def stage(stage_id: str, ran: bool = True) -> dict:
            nonlocal started
            now = time.perf_counter()
            event = {
                "event": "stage",
                "id": stage_id,
                "ran": ran,
                "ms": round((now - started) * 1000, 1),
            }
            started = now
            return event

        reading = Reading()
        changes: list[str] = []
        if text is not None:
            self.store.add_message(conversation_id, "user", text)
            reading, _reader_used = self.read_message(text, invention, state.last_asked)
            yield stage("understand")
            if "reset" in reading.intents:
                invention, state, analysis = Invention(), DialogueState(), None
                changes = ["Started a new invention"]
            else:
                changes = apply_reading(reading, invention, self.vocabulary)
                state.declined.extend(s for s in reading.declined if s not in state.declined)
            yield stage("extract")
        elif edit is not None:
            changes = apply_edit(edit, invention, self.vocabulary)
            if changes:
                self.store.add_message(
                    conversation_id,
                    "user",
                    "Edited in the panel: " + "; ".join(changes),
                    {"via": "panel"},
                )
            yield stage("understand", ran=False)
            yield stage("extract")
        else:
            self.store.add_message(
                conversation_id, "user", "Run the analysis again.", {"via": "button"}
            )
            rerun = True
            yield stage("understand", ran=False)
            yield stage("extract", ran=False)

        missing = dialogue.missing(invention, state)
        ready = dialogue.is_ready(missing)
        composition = _fingerprint(
            [
                [i.key, i.effective_percent, i.amount.model_dump() if i.amount else None]
                for i in invention.ingredients
            ]
            + [invention.form, invention.category, invention.use_terms, invention.title]
        )
        details = _fingerprint(invention.model_dump(exclude={"version"}))
        rerun = rerun or "rerun" in reading.intents
        due = ready and (analysis is None or rerun or state.fingerprints.get("assess") != details)

        reran: list[str] = []
        if due:
            composition_changed = (
                analysis is None or rerun or state.fingerprints.get("products") != composition
            )
            if composition_changed:
                products = find_products(invention, self.products)
                yield stage("products")
                knowledge = check_knowledge(invention, self.vocabulary)
                yield stage("knowledge")
                prior = search_prior_art(invention, self.records, self.vocabulary)
                yield stage("prior_art")
                yield stage("compare")
                reran += ["products", "knowledge", "prior_art", "compare"]
            else:
                assert analysis is not None
                products, knowledge, prior = (
                    analysis.products,
                    analysis.knowledge,
                    analysis.prior_art,
                )
                for stage_id in ("products", "knowledge", "prior_art", "compare"):
                    yield stage(stage_id, ran=False)
            sharpen = [s for s in missing if s not in dialogue.REQUIRED]
            assessment = assess(invention, products, knowledge, prior, sharpen)
            reran.append("assess")
            trigger = (
                "first run" if analysis is None
                else "requested" if rerun
                else "composition changed" if composition_changed
                else "details changed"
            )  # fmt: skip
            analysis = Analysis(
                created_at=time.time(),
                invention_version=invention.version,
                trigger=trigger,
                reran=reran,
                products=products,
                knowledge=knowledge,
                prior_art=prior,
                assessment=assessment,
                ip_options=ip_options(invention, assessment, self.vocabulary),
                next_steps=next_steps(invention, assessment, prior),
            )
            yield stage("assess")
            state.fingerprints = {"products": composition, "assess": details}
            self.store.add_run(
                conversation_id,
                trigger=trigger,
                indicator=assessment.indicator,
                products=len(products.matches),
                patents=len(prior.matches),
            )

        reply, meta = self._reply(
            reading, changes, invention, state, analysis, missing, ready, due, rerun
        )
        self.store.save(
            conversation_id,
            title=title_for(invention),
            invention=invention.model_dump(mode="json"),
            state=state.model_dump(),
            analysis=analysis.model_dump(mode="json") if analysis else None,
        )
        self.store.add_message(conversation_id, "assistant", reply, meta)
        yield {
            "event": "result",
            "conversation": self.get(username, conversation_id).model_dump(mode="json"),
        }

    def _reply(
        self, reading, changes, invention, state, analysis, missing, ready, due, rerun
    ) -> tuple[str, dict]:
        parts: list[str] = []
        meta: dict = {}
        if "reset" in reading.intents:
            parts.append("Started afresh. " + dialogue.GREETING)
        if reading.unmatched_removals:
            parts.append(
                f"I could not find {dialogue.listing(reading.unmatched_removals)} in your formulation."
            )
        if changes and "reset" not in reading.intents:
            parts.append("Noted: " + "; ".join(changes[:8]) + ".")
            total = dialogue.percent_total(invention)
            if (
                total is not None
                and len(changes)
                and any("→" in c or c.startswith(("Added", "Removed")) for c in changes)
            ):
                parts.append(f"Your percentages now add up to {_pct(total)}.")

        if due and analysis is not None:
            if (
                analysis.trigger in ("composition changed", "requested")
                and analysis.trigger != "first run"
            ):
                parts.append(
                    "I re-checked similar products, traditional knowledge, prior art and the assessment."
                )
            elif analysis.trigger == "details changed":
                parts.append(
                    "I updated the assessment; the product and record searches did not need re-running."
                )
            parts.append(dialogue.summary(analysis, invention))
            meta["analysis"] = True
        elif rerun and not ready:
            parts.append(
                "I cannot run the analysis yet. " + dialogue.explain_missing(invention, missing)
            )

        answered = False
        if analysis is not None:
            if "why_product" in reading.intents:
                parts.append(dialogue.explain_product(analysis, reading.target))
                answered = True
            if "why_patent" in reading.intents:
                parts.append(dialogue.explain_patent(analysis))
                answered = True
            if "difference" in reading.intents:
                parts.append(dialogue.explain_difference(analysis, invention))
                answered = True
        elif any(i in reading.intents for i in ("why_product", "why_patent", "difference")):
            parts.append(
                "There is no analysis yet to explain. "
                + dialogue.explain_missing(invention, missing)
            )
            answered = True
        if "missing" in reading.intents:
            parts.append(dialogue.explain_missing(invention, missing))
            answered = True
        if "other_question" in reading.intents:
            parts.append(dialogue.OTHER_QUESTION)
            meta["ask_link"] = True
            answered = True

        if reading.said_yes and state.last_asked == "brand":
            parts.append("What name will you use?")
            return "\n\n".join(parts), meta

        slot = dialogue.next_question(invention, state, missing)
        if slot and (not answered or slot in dialogue.REQUIRED):
            if (
                not parts
                and not reading.captured
                and reading.intents == []
                and state.last_asked == slot
                and slot in dialogue.REQUIRED
            ):
                parts.append("I did not pick that up.")
            if due and slot not in dialogue.REQUIRED:
                parts.append(
                    "To sharpen the assessment: " + dialogue.question_text(slot, invention)
                )
            else:
                parts.append(dialogue.question_text(slot, invention))
            state.last_asked = slot
            if slot not in state.asked:
                state.asked.append(slot)
            meta["suggestions"] = dialogue.SUGGESTIONS.get(slot, [])
            meta["asking"] = slot
        else:
            state.last_asked = None
            if not parts:
                parts.append(
                    "I have everything I asked for. You can change the formulation, ask why something was flagged, "
                    "or run the analysis again."
                )
        if analysis is not None and not meta.get("suggestions"):
            meta["suggestions"] = dialogue.AFTER_ANALYSIS
        return "\n\n".join(parts), meta
