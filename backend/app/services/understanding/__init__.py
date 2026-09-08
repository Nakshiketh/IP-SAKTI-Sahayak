"""Reading the question before retrieving anything.

What this stage produces is a description of the question, not an answer to it:
which rights and which regulatory areas it touches, what it hints the product
might be, which entities it names, and — the one that can stop the pipeline —
whether it turns on a fact the reader has not given.

The vocabulary is `lexicon.json`, a data file. It records how people phrase
things and maps those phrasings onto the domain's own terms. It states no legal
consequence and asserts nothing about what any instrument says, which is why it
can be a lookup table at all; the moment a table starts saying what the law
requires it has to become a retrieval instead.

Two things come out of it that retrieval needs. The rights and areas become
metadata pre-filters. The expanded query gives the lexical channel the terms of
art a reader did not use: someone typing "GI tag" is asking about geographical
indications, and the section they need says "geographical indication".
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from app.models.domain import IPRight, ProductClass, RegulatoryArea
from app.retrieval.tokenize import fold, tokenize

LEXICON_PATH = Path(__file__).parent / "lexicon.json"


class Intent(StrEnum):
    """What the reader is trying to do. Steers ranking, never the answer text."""

    PROTECT = "protect"
    ROUTE_TO_MARKET = "route_to_market"
    CLASSIFY = "classify"
    ABS = "abs"
    PRIOR_ART = "prior_art"
    GO_ABROAD = "go_abroad"
    GENERAL = "general"


class ClarificationReason(StrEnum):
    PRODUCT_CLASS_UNKNOWN = "product_class_unknown"


@dataclass(frozen=True)
class Understanding:
    ip_rights: tuple[IPRight, ...] = ()
    regulatory_areas: tuple[RegulatoryArea, ...] = ()
    product_class_hints: tuple[ProductClass, ...] = ()
    entities: dict[str, tuple[str, ...]] = field(default_factory=dict)
    intent: Intent = Intent.GENERAL
    #: The question plus the domain terms it implied, for the lexical channel.
    expanded_query: str = ""
    #: Set when the question cannot be answered until the reader says more.
    clarification_needed: ClarificationReason | None = None
    #: Which families the question straddled, for the interface to name.
    clarification_families: tuple[str, ...] = ()


class Lexicon:
    def __init__(self, raw: dict) -> None:
        self._raw = raw
        self.ip_rights = self._folded(raw["ip_rights"])
        self.regulatory_areas = self._folded(raw["regulatory_areas"])
        self.product_class_hints = self._folded(raw["product_class_hints"])
        self.entities = self._folded(raw["entities"])
        self.expansions = {fold(key): tuple(values) for key, values in raw["expansions"].items()}
        self.families = self._folded(raw["clarification"]["families"])

    @staticmethod
    def _folded(section: dict[str, list[str]]) -> dict[str, tuple[tuple[str, ...], ...]]:
        """Phrases become tuples of folded tokens, matched as a run.

        A multi-word phrase has to match as a phrase: "prior art" appearing as
        two words fifty tokens apart is not a mention of prior art.
        """
        return {
            key: tuple(tuple(tokenize(phrase, drop_stopwords=False)) for phrase in phrases)
            for key, phrases in section.items()
        }

    @classmethod
    def load(cls, path: Path | None = None) -> Lexicon:
        return cls(json.loads((path or LEXICON_PATH).read_text(encoding="utf-8")))


_LEXICON: Lexicon | None = None


def get_lexicon() -> Lexicon:
    global _LEXICON
    if _LEXICON is None:
        _LEXICON = Lexicon.load()
    return _LEXICON


def contains_run(tokens: list[str], run: tuple[str, ...]) -> bool:
    """Does this phrase appear as a phrase?

    Public because ingestion tags a passage with the same lexicon this stage
    reads a question with. One vocabulary on both sides of a retrieval is the
    point; two would drift, and the drift would show up as a filter quietly
    excluding the passage the reader needed.
    """
    if not run:
        return False
    length = len(run)
    return any(
        tuple(tokens[index : index + length]) == run for index in range(len(tokens) - length + 1)
    )


def matching_keys(
    tokens: list[str], section: dict[str, tuple[tuple[str, ...], ...]]
) -> tuple[str, ...]:
    """Every key in a lexicon section whose phrases appear in these tokens."""
    return tuple(
        key
        for key, phrases in section.items()
        if any(contains_run(tokens, phrase) for phrase in phrases)
    )


def _matches(tokens: list[str], section: dict[str, tuple[tuple[str, ...], ...]]) -> list[str]:
    return list(matching_keys(tokens, section))


def understand_query(
    question: str,
    *,
    product_class: ProductClass = ProductClass.UNDETERMINED,
    lexicon: Lexicon | None = None,
) -> Understanding:
    lex = lexicon or get_lexicon()
    tokens = tokenize(question, drop_stopwords=False)

    rights = tuple(IPRight(value) for value in _matches(tokens, lex.ip_rights))
    areas = tuple(RegulatoryArea(value) for value in _matches(tokens, lex.regulatory_areas))
    hints = tuple(ProductClass(value) for value in _matches(tokens, lex.product_class_hints))

    entities: dict[str, tuple[str, ...]] = {}
    for category, phrases in lex.entities.items():
        found = [" ".join(phrase) for phrase in phrases if contains_run(tokens, phrase)]
        if found:
            entities[category] = tuple(found)

    families = tuple(_matches(tokens, lex.families))
    clarification = None
    if len(families) >= 2 and product_class is ProductClass.UNDETERMINED:
        clarification = ClarificationReason.PRODUCT_CLASS_UNKNOWN

    return Understanding(
        ip_rights=rights,
        regulatory_areas=areas,
        product_class_hints=hints,
        entities=entities,
        intent=_intent(rights, areas, families, tokens),
        expanded_query=_expand(question, tokens, rights, areas, lex),
        clarification_needed=clarification,
        clarification_families=families if clarification else (),
    )


def _intent(
    rights: tuple[IPRight, ...],
    areas: tuple[RegulatoryArea, ...],
    families: tuple[str, ...],
    tokens: list[str],
) -> Intent:
    """One intent, resolved in a fixed order rather than by score.

    The order encodes which reading wins when a question is several things at
    once, and it is the order the product's own argument runs in: what the
    product is comes before what may be protected, which comes before how it
    reaches a market.
    """
    if len(families) >= 2:
        return Intent.CLASSIFY
    if RegulatoryArea.ABS_COMPLIANCE in areas:
        return Intent.ABS
    if contains_run(tokens, ("prior", "art")) or contains_run(tokens, ("alreadi", "record")):
        return Intent.PRIOR_ART
    if RegulatoryArea.IMPORT_EXPORT in areas:
        return Intent.GO_ABROAD
    if rights:
        return Intent.PROTECT
    if areas:
        return Intent.ROUTE_TO_MARKET
    return Intent.GENERAL


def _expand(
    question: str,
    tokens: list[str],
    rights: tuple[IPRight, ...],
    areas: tuple[RegulatoryArea, ...],
    lex: Lexicon,
) -> str:
    """The question, plus the domain's word for what it was asking about.

    Only terms the question actually implied are added. This is not query
    rewriting and it never replaces what the reader typed — the original text
    stays first, so a term of art the reader used keeps its weight.
    """
    extra: list[str] = []
    for token in tokens:
        extra.extend(lex.expansions.get(token, ()))
    extra.extend(right.value.replace("_", " ") for right in rights)
    extra.extend(area.value.replace("_", " ") for area in areas)
    return question if not extra else question + " " + " ".join(dict.fromkeys(extra))
