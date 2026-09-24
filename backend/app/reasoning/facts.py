"""Reading facts out of what the reader wrote, and nothing more.

Three properties matter more than coverage here:

* A fact is recorded only when the text states it. Everything else is unknown,
  and unknown is reported, never filled in.
* Negation is honoured. "It has never been sold" states that it has not been
  sold; reading it as "sold" would invert the one fact that decides whether a
  patent application is still possible.
* Every fact keeps the words it came from, so a reader can see what was read
  into their question and say it was wrong.

No model is involved. A model could extract more facts from freer prose, but it
could also extract a fact nobody stated, and a fabricated fact here changes the
regulatory category the whole answer is built on.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.domain import Fact, MissingFact
from app.reasoning.rules import FactRules, get_fact_rules
from app.retrieval.tokenize import fold


@dataclass(frozen=True)
class ExtractedFacts:
    stated: tuple[Fact, ...] = ()
    #: Keys the text did not settle either way.
    unknown: tuple[str, ...] = ()

    def value(self, key: str) -> bool | None:
        for fact in self.stated:
            if fact.key == key:
                return fact.value
        return None

    def as_map(self) -> dict[str, bool]:
        return {fact.key: fact.value for fact in self.stated}


#: A clause ends here. Clause boundaries matter because a hedge governs its own
#: clause and no further: in "we sell a face pack; we want to know whether it is
#: a cosmetic", the first clause states a fact and the second states nothing.
_CLAUSE_END = frozenset(".;?!:")


def _words(text: str) -> tuple[list[str], list[str], list[int]]:
    """Fold every word, keeping the reader's own word and its clause at the same index.

    Stopwords stay, unlike in `tokenize`: "not", "no" and "never" are exactly
    the words that decide a fact. The lists stay aligned so a match found in the
    folded text can be shown back in the words the reader actually used, and
    tested against the clause it sits in.
    """
    folded: list[str] = []
    original: list[str] = []
    clauses: list[int] = []
    clause = 0
    for token in text.split():
        stripped = "".join(character for character in token if character.isalnum())
        if stripped:
            folded.append(fold(stripped.lower()))
            original.append(token)
            clauses.append(clause)
        if any(character in _CLAUSE_END for character in token):
            clause += 1
    return folded, original, clauses


def _hedged_clauses(words: list[str], clauses: list[int], rules: FactRules) -> frozenset[int]:
    """Clauses that hedge, and therefore state nothing."""
    return frozenset(
        clause for word, clause in zip(words, clauses, strict=True) if word in rules.hedge_markers
    )


def _find(words: list[str], phrase: tuple[str, ...]) -> int | None:
    """Where the phrase occurs as a run of words, or None."""
    if not phrase:
        return None
    span = len(phrase)
    for start in range(len(words) - span + 1):
        if tuple(words[start : start + span]) == phrase:
            return start
    return None


def _negated(words: list[str], at: int, rules: FactRules) -> bool:
    """Is there a negation marker in the few words before this match?"""
    start = max(0, at - rules.negation_window)
    return any(word in rules.negation_markers for word in words[start:at])


def _span(original: list[str], at: int, length: int) -> str:
    """The reader's own words around the match, for showing back to them."""
    start = max(0, at - 3)
    return " ".join(original[start : at + length + 3]).strip()


def extract_facts(text: str, rules: FactRules | None = None) -> ExtractedFacts:
    rules = rules or get_fact_rules()
    words, original, clauses = _words(text)
    hedged = _hedged_clauses(words, clauses, rules)
    stated: list[Fact] = []
    unknown: list[str] = []

    def stated_at(at: int) -> bool:
        return clauses[at] not in hedged

    for key, definition in rules.definitions.items():
        value: bool | None = None
        matched_at: int | None = None
        matched_len = 0

        # An outright denial wins over an assertion: "it is not a classical
        # formulation, it is our own recipe" states both shapes, and the denial
        # is the one the reader meant.
        for phrase in definition.no_phrases:
            at = _find(words, phrase)
            if at is not None and stated_at(at):
                value, matched_at, matched_len = False, at, len(phrase)
                break

        if value is None:
            for phrase in definition.yes_phrases:
                at = _find(words, phrase)
                if at is not None and stated_at(at):
                    value = not _negated(words, at, rules)
                    matched_at, matched_len = at, len(phrase)
                    break

        if value is None or matched_at is None:
            unknown.append(key)
            continue
        stated.append(Fact(key=key, value=value, span=_span(original, matched_at, matched_len)))

    return ExtractedFacts(stated=tuple(stated), unknown=tuple(unknown))


def missing(
    keys: list[str], facts: ExtractedFacts, rules: FactRules | None = None
) -> list[MissingFact]:
    """The material facts among `keys` that the question did not settle."""
    rules = rules or get_fact_rules()
    return [
        MissingFact(key=key, question=rules.definitions[key].question)
        for key in keys
        if key in rules.definitions and facts.value(key) is None
    ]
