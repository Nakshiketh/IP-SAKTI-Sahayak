"""The built-in reader: one message becomes a structured change to the invention.

Rules, not a model. It understands the shapes inventors actually write — "Neem 10%,
Turmeric 10%", "Multani Mitti — 40 g — 40%", "10 g of neem powder", "I changed Neem
from 20% to 10% and added Turmeric 10%", "remove the rose powder" — and it reads a
short answer in the light of the question it answers. It never invents: every name
and number it returns is in the message.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.analyst.lexicon import PROCESS_VERB, find_form, find_parameters, use_terms
from app.analyst.models import Amount, Invention
from app.analyst.vocabulary import Vocabulary, fold

UNITS = {
    "%": "%", "percent": "%", "per cent": "%", "percentage": "%", "w/w": "%", "w/v": "%",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g", "gr": "g",
    "mg": "mg", "milligram": "mg", "milligrams": "mg",
    "kg": "kg", "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    "ml": "ml", "millilitre": "ml", "milliliter": "ml", "millilitres": "ml", "milliliters": "ml",
    "l": "l", "litre": "l", "liter": "l", "litres": "l", "liters": "l",
    "part": "part", "parts": "part",
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
    "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
    "cup": "cup", "cups": "cup", "drop": "drop", "drops": "drop", "pinch": "pinch",
}  # fmt: skip
_UNIT = "|".join(sorted((re.escape(unit) for unit in UNITS), key=len, reverse=True))
QUANTITY = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*(" + _UNIT + r")(?![a-z])", re.IGNORECASE)

_FILLER_WORDS = (
    "and|plus|with|of|the|a|an|i|we|have|has|had|used|use|using|added|add|adding|also|"
    "contains?|containing|includes?|including|ingredients?|are|is|now|should|be|at|about|"
    "around|approx|approximately|roughly|then|mixed|mix|made|from|it|its|my|our|this|"
    "change|changed|make|set|reduce|reduced|increase|increased|put|rest|remaining|balance"
)
LEADING = re.compile(r"^(?:[\s\-:=,;.&+*()•]|\b(?:" + _FILLER_WORDS + r")\b)+", re.IGNORECASE)
TRAILING = re.compile(
    r"(?:[\s\-:=,;.&+(]|\b(?:at|is|of|about|approx|each|and|with|to|by|weight|wt)\b)+$",
    re.IGNORECASE,
)
PURPOSE_LEAD = re.compile(
    r"^\s*[-:,(]?\s*(?:for|to|as|helps?(?: to| with)?|which|that|used for|used as|acts as|gives|provides)\s+(.+)",
    re.IGNORECASE,
)
NOT_A_NAME = {
    "for",
    "total",
    "batch",
    "batch size",
    "makes",
    "yield",
    "net weight",
    "net wt",
    "each",
    "per",
}

SECTION = re.compile(
    r"^\s*(purpose|intended use|uses?|benefits?|process|method|preparation|procedure|"
    r"manufacturing|steps|problem|technical problem|what'?s new|novelty|advantages?|"
    r"ingredients?|composition|formula(?:tion)?)\s*[:\-]\s*(.*)$",
    re.IGNORECASE,
)
SECTION_FIELD = {
    "purpose": "use", "intended use": "use", "use": "use", "uses": "use", "benefit": "use",
    "benefits": "use", "process": "process", "method": "process", "preparation": "process",
    "procedure": "process", "manufacturing": "process", "steps": "process", "problem": "problem",
    "technical problem": "problem", "whats new": "novelty", "what's new": "novelty",
    "novelty": "novelty", "advantage": "novelty", "advantages": "novelty",
    "ingredient": "ingredients", "ingredients": "ingredients", "composition": "ingredients",
    "formula": "ingredients", "formulation": "ingredients",
}  # fmt: skip

UNIT_OR_PCT = r"(%|percent|g|gm|grams?|mg|ml|kg|parts?)"
CHANGE = re.compile(
    r"\b(?:change[sd]?|update[sd]?|set|reduce[sd]?|increase[sd]?|lower(?:ed)?|raise[sd]?|adjust(?:ed)?|cut)\s+"
    r"(?:the\s+)?(?:amount of\s+|quantity of\s+|percentage of\s+|proportion of\s+)?"
    r"(?P<name>[^\d,;.]+?)\s+(?:(?:from|was)\s+\d+(?:\.\d+)?\s*" + UNIT_OR_PCT + r"?\s+)?"
    r"(?:to|down to|up to)\s+(?P<new>\d+(?:\.\d+)?)\s*(?P<unit>" + UNIT_OR_PCT + r")",
    re.IGNORECASE,
)
FROM_TO = re.compile(
    r"\b(?P<name>[a-z][a-z ()'-]*?)\s+from\s+\d+(?:\.\d+)?\s*" + UNIT_OR_PCT + r"?\s+to\s+"
    r"(?P<new>\d+(?:\.\d+)?)\s*(?P<unit>" + UNIT_OR_PCT + r")",
    re.IGNORECASE,
)
REMOVE = re.compile(
    r"\b(?:remove[sd]?|removing|drop(?:ped)?|delete[sd]?|take out|took out|exclude[sd]?|leave out|"
    r"left out|omit(?:ted)?|no longer (?:use|using|add|include|contains?|has))\s+(?:the\s+)?"
    r"(?P<name>[^,;.\d]+?)(?=\s*(?:,|;|\.|$|\band\b|\bbut\b))",
    re.IGNORECASE,
)
WITHOUT = re.compile(
    r"\bwithout\s+(?:the\s+|any\s+)?(?P<name>[a-z][^,;.\d]*?)(?=\s*(?:,|;|\.|$|\band\b))", re.I
)
REPLACE = re.compile(
    r"\b(?:replace[sd]?|replacing|swap(?:ped)?|substitute[sd]?)\s+(?:the\s+)?(?P<old>[^,;.\d]+?)\s+"
    r"(?:with|by|for)\s+(?P<new>[^,;]+?)(?=\s*(?:,|;|\.(?!\d)|$))",
    re.IGNORECASE,
)
BATCH = re.compile(
    r"\b(?:for|batch(?: size)?(?: of)?|makes|total(?: of)?)\s+(\d+(?:\.\d+)?)\s*(g|gm|gms|grams?|kg|ml|l)\b",
    re.IGNORECASE,
)
INGREDIENT_CONTEXT = re.compile(
    r"\b(ingredients?|contains?|made (?:with|of|from)|mixture of|blend of|combination of|consists? of|composed of)\b",
    re.IGNORECASE,
)
USE_CUE = re.compile(
    r"\b(for|used|use|helps?|meant|intended|designed|purpose|benefits?|aims?|so that)\b",
    re.IGNORECASE,
)
PROBLEM_CUE = re.compile(
    r"\b(problem|issue|challenge|solves?|drawbacks?|limitations?|existing products?|current products?|"
    r"most (?:products|packs|face packs)|complain)\b",
    re.IGNORECASE,
)
NOVELTY_CUE = re.compile(
    r"\b(novel|unique|different|differs?|unlike|innovative|improved|better than|special|distinct|"
    r"no other|nobody else|first (?:to|time))\b",
    re.IGNORECASE,
)
EVIDENCE_CUE = re.compile(
    r"\b(tested|test(?:s|ing)?|trials?|stud(?:y|ies)|lab(?:oratory)?|clinical|patch test|stability|"
    r"shelf[- ]life|measured|volunteers?|participants?)\b",
    re.IGNORECASE,
)
PUBLIC = re.compile(
    r"\b(selling|sold|launched|on the market|in the market|available online|published|exhibition|"
    r"on (?:my|our) website|amazon|customers)\b",
    re.IGNORECASE,
)
CONFIDENTIAL = re.compile(
    r"\b(not (?:yet )?(?:sold|public|launched|published|disclosed|shared)|confidential|secret|"
    r"haven'?t (?:sold|shared|published|launched|disclosed)|nobody (?:knows|has seen)|kept private)\b",
    re.IGNORECASE,
)
BRAND = re.compile(
    r"\b(?:brand(?: name)?|sell it as|sold as|sell it under|market it as|call(?:ed)? it|product name)"
    r"\s*(?:is|will be|as|:|-)?\s*[\"']?(?P<b>[A-Z][\w&' -]{1,40}?)[\"']?(?=[,.;!?]|$)"
)
PACKAGING = re.compile(
    r"\b(packag\w*|bottle|jar|container|pouch|sachet|tube|carton|label design)\b", re.I
)
REGION = re.compile(
    r"\b(geographical indication|sourced from|grown in|harvested in|traditional to)\b", re.I
)

SKIP = re.compile(
    r"^\s*(skip|pass|not sure|no idea|don'?t know|i don'?t know|prefer not(?: to)?|rather not|n/?a|none|no|nope|not yet|no brand yet)\s*[.!]?\s*$",
    re.IGNORECASE,
)
YES = re.compile(r"^\s*(yes|yeah|yep|it has|it is|already)\b", re.IGNORECASE)

INTENTS = (
    ("reset", re.compile(r"\b(start (?:over|again)|new invention|reset)\b", re.I)),
    (
        "rerun",
        re.compile(
            r"\b(re-?run|run (?:the |an )?(?:analysis|assessment|check)|analy[sz]e (?:it |this )?(?:again|now)|"
            r"check again|re-?assess|re-?check|run it again|another analysis)\b",
            re.I,
        ),
    ),
    (
        "why_patent",
        re.compile(r"\bwhy\b.*\b(patents?|prior art|records?|filings?|applications?)\b", re.I),
    ),
    (
        "why_product",
        re.compile(r"\bwhy\b.*\b(similar|match(?:ed|es)?|flagged|close|products?|pack)\b", re.I),
    ),
    (
        "difference",
        re.compile(
            r"\b(what makes|how is (?:it|mine|my)|in what way)\b.*\b(different|unique|new|novel|distinct)\b|"
            r"\bwhat(?:'s| is) (?:different|new|unique)\b|\bdifferences?\b",
            re.I,
        ),
    ),
    (
        "missing",
        re.compile(
            r"\bwhat(?:'s| is| else| information| info| details?)\b.*\b(missing|need|required)\b",
            re.I,
        ),
    ),
)


@dataclass
class ItemInput:
    name: str
    amount: Amount | None = None
    percent: float | None = None
    purpose: str | None = None


@dataclass
class Reading:
    intents: list[str] = field(default_factory=list)
    target: str | None = None
    fields: dict[str, object] = field(default_factory=dict)
    add_steps: list[str] = field(default_factory=list)
    add_parameters: list[str] = field(default_factory=list)
    add_features: list[str] = field(default_factory=list)
    upsert: list[ItemInput] = field(default_factory=list)
    remove: list[str] = field(default_factory=list)
    replace_composition: bool = False
    declined: list[str] = field(default_factory=list)
    unmatched_removals: list[str] = field(default_factory=list)
    said_yes: bool = False

    @property
    def captured(self) -> bool:
        return bool(
            self.fields
            or self.add_steps
            or self.add_features
            or self.upsert
            or self.remove
            or self.declined
            or self.add_parameters
        )


def normalise(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"[‒–—―−]", " - ", text).replace(" ", " ")
    return re.sub(r"(\d),(\d{3})(?!\d)", r"\1\2", text)


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\d])|\n+", text) if s.strip()]


def split_segments(line: str) -> list[str]:
    line = re.sub(r"^\s*(?:[-*•●]|\d+[.)])\s+", "", line)
    parts, depth, current = [], 0, []
    for character in line:
        if character in "([":
            depth += 1
        elif character in ")]":
            depth = max(0, depth - 1)
        if depth == 0 and character in ",;":
            parts.append("".join(current))
            current = []
        else:
            current.append(character)
    parts.append("".join(current))
    out: list[str] = []
    for part in parts:
        pieces = re.split(r"\s+(?:and|&|plus)\s+", part)
        if len(pieces) > 1 and sum(1 for piece in pieces if QUANTITY.search(piece)) >= 2:
            out.extend(pieces)
        else:
            out.append(part)
    return [part.strip() for part in out if part.strip()]


def clean_name(text: str, vocabulary: Vocabulary) -> str:
    previous = None
    while previous != text:
        previous = text
        text = LEADING.sub("", text)
        text = TRAILING.sub("", text)
    text = text.strip(" \"'.:")
    if text.count("(") > text.count(")"):
        text = text.rstrip("( ")
    if not text or not re.search(r"[A-Za-zऀ-෿]", text) or fold(text) in NOT_A_NAME:
        return ""
    words = text.split()
    if len(words) > 5:
        hits = vocabulary.find(text)
        if not hits:
            return ""
        folded = fold(text).split()
        return " ".join(folded[hits[-1].start :]).capitalize()
    if find_form(text) and not vocabulary.find(text):
        return ""
    return text[0].upper() + text[1:]


def _attach(item: ItemInput, value: float, unit: str) -> None:
    if unit == "%":
        if item.percent is None:
            item.percent = value
    elif item.amount is None:
        item.amount = Amount(value=value, unit=unit)


def parse_quantified(segment: str, vocabulary: Vocabulary) -> list[ItemInput]:
    matches = list(QUANTITY.finditer(segment))
    if not matches:
        return []
    pieces: list[tuple[str, object]] = []
    cursor = 0
    for match in matches:
        if match.start() > cursor:
            pieces.append(("text", segment[cursor : match.start()]))
        pieces.append(("qty", (float(match.group(1)), UNITS[match.group(2).lower()])))
        cursor = match.end()
    if cursor < len(segment):
        pieces.append(("text", segment[cursor:]))

    qty_first = pieces[0][0] == "qty"
    items: list[ItemInput] = []
    pending: list[tuple[float, str]] = []
    current: ItemInput | None = None
    for kind, value in pieces:
        if kind == "qty":
            number, unit = value  # type: ignore[misc]
            if current is None or qty_first:
                pending.append((number, unit))
            else:
                _attach(current, number, unit)
            continue
        text = str(value)
        if current is not None and not qty_first:
            purpose = PURPOSE_LEAD.match(text)
            if purpose:
                current.purpose = purpose.group(1).strip(" ).,;")
                continue
            bracketed = re.fullmatch(r"\s*\(([^)]+)\)\s*[.,]?\s*", text)
            if bracketed and not vocabulary.find(bracketed.group(1)):
                current.purpose = bracketed.group(1).strip()
                continue
        name = clean_name(text, vocabulary)
        if not name:
            continue
        current = ItemInput(name=name)
        items.append(current)
        for number, unit in pending:
            _attach(current, number, unit)
        pending = []
    if pending and current is not None:
        for number, unit in pending:
            _attach(current, number, unit)
    return items


def match_existing(name: str, invention: Invention, vocabulary: Vocabulary):
    term = vocabulary.recognise(name)
    folded = fold(name)
    for ingredient in invention.ingredients:
        if term and ingredient.vocabulary_id == term.id:
            return ingredient
        existing = fold(ingredient.name)
        if folded and (
            folded == existing
            or f" {folded} " in f" {existing} "
            or f" {existing} " in f" {folded} "
        ):
            return ingredient
    return None


def read(
    text: str, invention: Invention, last_asked: str | None, vocabulary: Vocabulary
) -> Reading:
    reading = Reading()
    raw = text.strip()
    norm = normalise(raw)
    lowered = norm.lower()

    for intent, pattern in INTENTS:
        if pattern.search(lowered):
            reading.intents.append(intent)
    if "why_patent" in reading.intents and "why_product" in reading.intents:
        reading.intents.remove("why_product")
    target = re.search(
        r"\bwhy (?:is|was|did|are|were) (?:the )?(?P<t>.+?)\s+(?:considered |flagged |marked |shown |listed )?"
        r"(?:as )?(?:similar|a match|close|flagged|relevant)",
        norm,
        re.IGNORECASE,
    )
    if target:
        reading.target = target.group("t")
    is_question = raw.endswith("?") or bool(
        re.match(
            r"^(what|why|how|can|could|is|are|does|do|should|will|would|which|when|where|who)\b",
            lowered,
        )
    )
    if "reset" in reading.intents:
        return reading

    # A short answer is read in the light of the question it answers.
    if SKIP.match(norm):
        if last_asked == "disclosure" and re.match(r"^\s*(no|nope|not yet)\b", lowered):
            reading.fields["disclosure"] = "confidential"
        elif last_asked:
            reading.declined.append(last_asked)
        return reading
    if YES.match(norm) and len(norm.split()) <= 3:
        if last_asked == "disclosure":
            reading.fields["disclosure"] = "public"
        reading.said_yes = True
        return reading
    if is_question and reading.intents and not QUANTITY.search(norm):
        return reading

    working = norm

    # -- explicit changes, consumed before the list parser sees them
    for pattern in (CHANGE, FROM_TO):
        for match in list(pattern.finditer(working)):
            name = clean_name(match.group("name"), vocabulary)
            if not name:
                continue
            item = ItemInput(name=name)
            _attach(
                item,
                float(match.group("new")),
                UNITS.get(match.group("unit").lower(), match.group("unit").lower()),
            )
            reading.upsert.append(item)
            working = working.replace(match.group(0), " , ")
    for match in list(REPLACE.finditer(working)):
        old = clean_name(match.group("old"), vocabulary)
        new_items = parse_quantified(match.group("new"), vocabulary) or (
            [ItemInput(name=clean_name(match.group("new"), vocabulary))]
            if clean_name(match.group("new"), vocabulary)
            else []
        )
        existing = match_existing(old, invention, vocabulary) if old else None
        if existing and new_items:
            reading.remove.append(existing.key)
            for item in new_items:
                if item.percent is None and item.amount is None:
                    item.percent, item.amount = existing.percent, existing.amount
                reading.upsert.append(item)
            working = working.replace(match.group(0), " , ")
    for pattern in (REMOVE, WITHOUT):
        for match in list(pattern.finditer(working)):
            name = clean_name(match.group("name"), vocabulary)
            existing = match_existing(name, invention, vocabulary) if name else None
            if existing:
                reading.remove.append(existing.key)
                working = working.replace(match.group(0), " , ")
            elif pattern is REMOVE and name:
                reading.unmatched_removals.append(name)
                working = working.replace(match.group(0), " , ")

    # -- lines, by section
    original_lines = [line for line in raw.splitlines() if line.strip()]
    lines = [line for line in working.splitlines() if line.strip()]
    section: str | None = None
    context = last_asked in ("ingredients", "quantities") or bool(
        INGREDIENT_CONTEXT.search(working)
    )
    use_parts: list[str] = []
    for index, line in enumerate(lines):
        header = SECTION.match(line)
        if header:
            section = SECTION_FIELD.get(header.group(1).lower().replace("’", "'"))
            line = header.group(2)
            if not line.strip():
                continue
        if (
            index == 0
            and len(lines) > 1
            and not QUANTITY.search(line)
            and len(line.split()) <= 10
            and not line.rstrip().endswith("?")
        ) and (
            find_form(line)
            or re.search(r"\b(formulation|pack|oil|cream|churna|powder|blend)\b", line, re.I)
        ):
            reading.fields["title"] = original_lines[0].strip().rstrip(":")
            continue
        if section == "use":
            use_parts.append(line.strip())
            continue
        if section == "process":
            reading.add_steps.extend(
                s.strip(" -") for s in re.split(r";|\bthen\b|(?<=\.)\s", line) if s.strip(" -.")
            )
            continue
        if section == "problem":
            reading.fields["problem"] = line.strip()
            continue
        if section == "novelty":
            reading.add_features.append(line.strip())
            continue

        for segment in split_segments(line):
            items = parse_quantified(segment, vocabulary)
            if items:
                reading.upsert.extend(items)
                continue
            # A purpose given for an ingredient already listed: "neem for acne".
            purpose = re.match(
                r"^(?P<n>[^,]+?)\s+(?:is |are )?(?:for|used for|helps?(?: to| with)?|to|as|gives|provides|acts as)\s+(?P<p>.+)$",
                segment,
                re.IGNORECASE,
            )
            if purpose and invention.ingredients:
                existing = match_existing(
                    clean_name(purpose.group("n"), vocabulary), invention, vocabulary
                )
                if existing:
                    reading.upsert.append(
                        ItemInput(name=existing.name, purpose=purpose.group("p").strip(" ."))
                    )
                    continue
            if context or section == "ingredients":
                for hit in vocabulary.find(segment):
                    reading.upsert.append(ItemInput(name=hit.term.common_name.capitalize()))
                if not vocabulary.find(segment) and (
                    section == "ingredients" or last_asked == "ingredients"
                ):
                    name = clean_name(segment, vocabulary)
                    if name and len(name.split()) <= 4:
                        reading.upsert.append(ItemInput(name=name))

    # A whole composition restated replaces the old one.
    stated = [item.percent for item in reading.upsert if item.percent is not None]
    if len(stated) >= 3 and 95 <= sum(stated) <= 105 and not reading.remove:
        reading.replace_composition = True

    batch = BATCH.search(norm)
    if batch:
        reading.fields["batch_size"] = Amount(
            value=float(batch.group(1)), unit=UNITS.get(batch.group(2).lower(), "g")
        )

    # -- product form
    if not invention.form:
        for sentence in sentences(norm):
            if QUANTITY.search(sentence) and not re.search(r"\bfor\s+\d", sentence, re.I):
                continue
            form = find_form(sentence)
            if form:
                reading.fields["form"] = form.id
                reading.fields["category"] = form.category
                break
    if (reading.upsert or "form" in reading.fields) and not invention.invention_type:
        reading.fields["invention_type"] = "formulation"

    # -- the rest, sentence by sentence
    free = [s for s in sentences(working) if not QUANTITY.search(s) and not SECTION.match(s)]
    if last_asked == "use" and not is_question and not reading.upsert:
        use_parts.append(norm)
    for sentence in free:
        if sentence.endswith("?"):
            continue
        uses = use_terms(sentence)
        if uses and USE_CUE.search(sentence) and sentence not in use_parts and last_asked != "use":
            use_parts.append(sentence)
        elif last_asked == "process" or (PROCESS_VERB.search(sentence) and not uses):
            reading.add_steps.append(sentence.rstrip("."))
        if PROBLEM_CUE.search(sentence) or last_asked == "problem":
            reading.fields["problem"] = sentence
        if (
            NOVELTY_CUE.search(sentence)
            and not re.search(r"\bnew (face|hair|product|formulation|invention)", sentence, re.I)
        ) or last_asked == "novelty":
            reading.add_features.append(sentence)
        if EVIDENCE_CUE.search(sentence) or last_asked == "evidence":
            reading.fields["evidence"] = sentence
        if CONFIDENTIAL.search(sentence):
            reading.fields["disclosure"] = "confidential"
        elif PUBLIC.search(sentence) or (last_asked == "disclosure" and YES.match(sentence)):
            reading.fields["disclosure"] = "public"
        if PACKAGING.search(sentence):
            reading.fields["packaging_note"] = sentence
        if REGION.search(sentence):
            reading.fields["region_note"] = sentence
    if use_parts:
        reading.fields["intended_use"] = " ".join(dict.fromkeys(part.strip() for part in use_parts))
    if reading.add_steps or last_asked == "process":
        reading.add_parameters.extend(find_parameters(norm))

    brand = BRAND.search(norm)
    if brand:
        reading.fields["brand_name"] = brand.group("b").strip()
    elif (
        last_asked == "brand" and not is_question and len(norm.split()) <= 6 and not reading.upsert
    ):
        name = re.sub(
            r"^(?:it'?s|it is|called|the brand is|brand is|name is)\s+", "", norm, flags=re.I
        ).strip(" .\"'")
        if name:
            reading.fields["brand_name"] = name

    if is_question and not reading.captured and not reading.intents:
        reading.intents.append("other_question")
    return reading
