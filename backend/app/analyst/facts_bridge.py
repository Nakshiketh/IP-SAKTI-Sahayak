"""Turning a described product into the facts the Phase 2 rules read.

Check My Product and Ask Sahayak must not disagree about what a product is. The
way to guarantee that is not to write a second classifier here but to hand the
same rules the same kind of input, so `data/rules/classification_rules.yaml`
decides in both places.

What is different here is where the facts come from. Ask reads them out of a
sentence; this reads them off a structure the person filled in one answer at a
time. That makes two things possible that free text cannot do:

* A field they explicitly declined — "I don't know", "skip" — becomes a missing
  fact with the question still attached, rather than silence. Not knowing is an
  answer, and it is one the rules can use.
* A fact taken from a field is certain in a way a phrase match never is, so
  nothing here goes through the hedge and negation machinery.
"""

from __future__ import annotations

from app.analyst.models import Invention
from app.models.domain import Fact, MissingFact
from app.reasoning.facts import ExtractedFacts, extract_facts
from app.reasoning.rules import get_fact_rules

#: Dialogue slot -> the fact it settles. Only slots that decide a classification
#: rule are listed; the rest of the conversation is about other things.
SLOT_FACTS: dict[str, str] = {
    "form": "external_use",
    "intended_use": "therapeutic_claim",
    "source_texts": "classical_text_formulation",
    "process": "new_process",
    "disclosure": "publicly_disclosed",
    "brand_name": "brand_name",
}

#: Product forms that are applied rather than taken. Read off the form field, so
#: no phrase matching is involved.
EXTERNAL_FORMS = frozenset(
    {
        "face_pack",
        "face_wash",
        "cream",
        "lotion",
        "oil",
        "taila",
        "balm",
        "ointment",
        "soap",
        "shampoo",
        "serum",
        "gel",
    }
)
INTERNAL_FORMS = frozenset(
    {"churna", "powder", "tablet", "capsule", "syrup", "juice", "tea", "arishta", "asava", "ghrita"}
)

FOOD_FORMS = frozenset({"juice", "tea", "drink", "beverage", "supplement"})


def _fold(value: str | None) -> str:
    return (value or "").strip().lower().replace("-", "_").replace(" ", "_")


def facts_of(invention: Invention, declined: list[str] | None = None) -> ExtractedFacts:
    """The facts this product description settles, and the ones it leaves open."""
    stated: list[Fact] = []
    known: set[str] = set()

    def state(key: str, value: bool, span: str) -> None:
        if key in known:
            return
        known.add(key)
        stated.append(Fact(key=key, value=value, span=span))

    form = _fold(invention.form)
    if form in EXTERNAL_FORMS:
        state("external_use", True, invention.form or form)
    elif form in INTERNAL_FORMS:
        state("external_use", False, invention.form or form)
    if form in FOOD_FORMS:
        state("food_form", True, invention.form or form)

    if invention.source_texts:
        state("classical_text_formulation", True, invention.source_texts[0])

    if invention.process_steps or invention.distinctive_features:
        state(
            "new_process",
            True,
            (invention.process_steps or invention.distinctive_features)[0],
        )

    if invention.disclosure is not None:
        state("publicly_disclosed", invention.disclosure == "public", invention.disclosure)

    if invention.brand_name:
        state("brand_name", True, invention.brand_name)

    if any(ingredient.kind == "traditional" for ingredient in invention.ingredients):
        traditional = next(i for i in invention.ingredients if i.kind == "traditional")
        state("uses_biological_resource", True, traditional.name)

    # The free-text fields fill the gaps the structured ones leave. A field the
    # person typed themselves — what it is for, what problem it solves — is the
    # only place a claim like "for glowing skin" or "treats eczema" appears, and
    # that claim decides which regulator the product answers to. Structured
    # fields already recorded win, so prose can add but never overrule.
    prose = " . ".join(
        part for part in (invention.title, invention.intended_use, invention.problem) if part
    )
    if prose:
        for fact in extract_facts(prose).stated:
            state(fact.key, fact.value, fact.span)

    rules = get_fact_rules()
    unknown = tuple(key for key in rules.definitions if key not in known)
    del declined  # recorded separately, by `missing_from_declines`
    return ExtractedFacts(stated=tuple(stated), unknown=unknown)


def missing_from_declines(declined: list[str]) -> list[MissingFact]:
    """Slots the person was asked about and chose not to answer.

    Kept apart from facts the question simply never reached. "I would rather not
    say" and "nobody asked" look the same in a data structure and are not the
    same thing to report back.
    """
    rules = get_fact_rules()
    out: list[MissingFact] = []
    for slot in declined:
        key = SLOT_FACTS.get(slot)
        if key and key in rules.definitions:
            out.append(MissingFact(key=key, question=rules.definitions[key].question))
    return out
