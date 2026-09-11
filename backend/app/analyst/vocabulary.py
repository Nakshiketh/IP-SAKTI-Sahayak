"""The reference vocabulary, and the one way this package reads an ingredient name.

`data/vocabulary.json` is shared with the step-by-step product check in the web app,
which imports the same file, so the two surfaces cannot disagree about what an
ingredient is called.

Matching is on whole words after folding, and it is longest-first from left to
right. That is not a nicety: "Daru Haldi" is tree turmeric and "Rakta chandan" is
red sandalwood, and a matcher that found "haldi" or "chandan" inside them would put
the wrong plant in an inventor's comparison.
"""

from __future__ import annotations

import json
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

VOCABULARY_PATH = Path(__file__).parent / "data" / "vocabulary.json"

TermKind = Literal["traditional", "material", "excipient"]


def fold(text: str) -> str:
    """Case, accents and punctuation folded away; words separated by one space.

    The same result as `fold` in the web app for Latin text. It keeps the vowel signs
    of Indic scripts, which are combining marks: dropping them would cut a word in
    half.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    kept: list[str] = []
    previous_latin = False
    for character in decomposed:
        if unicodedata.category(character).startswith("M"):
            if not previous_latin:
                kept.append(character)
            continue
        previous_latin = "a" <= character.lower() <= "z"
        kept.append(character.lower() if character.isalnum() else " ")
    return " ".join("".join(kept).split())


@dataclass(frozen=True)
class Term:
    id: str
    label: str
    kind: TermKind
    names: tuple[str, ...]

    @property
    def traditional(self) -> bool:
        return self.kind == "traditional"

    @property
    def excipient(self) -> bool:
        return self.kind == "excipient"

    @property
    def common_name(self) -> str:
        """The first name listed, which is the everyday one."""
        return self.names[0]


@dataclass(frozen=True)
class Hit:
    term: Term
    #: Word offsets into the folded text, end exclusive.
    start: int
    end: int

    @property
    def size(self) -> int:
        return self.end - self.start


@dataclass(frozen=True)
class Classical:
    id: str
    label: str
    names: tuple[str, ...]
    #: Defining ingredients, only where the set is short and settled.
    ingredients: tuple[str, ...]


@dataclass(frozen=True)
class ClassicalMatch:
    formulation: Classical
    via: Literal["name", "ingredients"]


class Vocabulary:
    def __init__(self, raw: dict) -> None:
        terms: dict[str, Term] = {}
        for row in raw["traditional_ingredients"]:
            terms[row["id"]] = Term(row["id"], row["label"], "traditional", tuple(row["names"]))
        for row in raw["materials"]:
            if row["id"] in terms:
                raise ValueError("Vocabulary id listed twice: " + row["id"])
            terms[row["id"]] = Term(row["id"], row["label"], row["kind"], tuple(row["names"]))
        self.terms = terms

        # One name, one meaning. A name listed under two ids would make the match
        # depend on file order, which is a bug nobody would see.
        index: dict[tuple[str, ...], Term] = {}
        for term in terms.values():
            for name in term.names:
                words = tuple(fold(name).split())
                if not words:
                    continue
                other = index.get(words)
                if other is not None and other.id != term.id:
                    raise ValueError(f'"{name}" names both {other.id} and {term.id}')
                index[words] = term

        by_first: dict[str, list[tuple[tuple[str, ...], Term]]] = {}
        for words, term in index.items():
            by_first.setdefault(words[0], []).append((words, term))
        for candidates in by_first.values():
            candidates.sort(key=lambda item: -len(item[0]))
        self._by_first = by_first

        self.classical = tuple(
            Classical(
                id=row["id"],
                label=row["label"],
                names=tuple(row["names"]),
                ingredients=tuple(row.get("ingredients") or ()),
            )
            for row in raw["classical_formulations"]
        )
        self.descriptive_words = frozenset(raw["descriptive_words"])

    # -- reading -----------------------------------------------------------

    def find(self, text: str) -> list[Hit]:
        """Every vocabulary name in `text`, longest first, never overlapping."""
        words = fold(text).split()
        hits: list[Hit] = []
        position = 0
        while position < len(words):
            for name, term in self._by_first.get(words[position], ()):
                size = len(name)
                if tuple(words[position : position + size]) == name:
                    hits.append(Hit(term, position, position + size))
                    position += size
                    break
            else:
                position += 1
        return hits

    def recognise(self, entry: str) -> Term | None:
        """The ingredient one entry names — the longest name found in it."""
        hits = self.find(entry)
        if not hits:
            return None
        return max(hits, key=lambda hit: (hit.size, -hit.start)).term

    def get(self, term_id: str) -> Term | None:
        return self.terms.get(term_id)

    @property
    def traditional_count(self) -> int:
        return sum(1 for term in self.terms.values() if term.traditional)

    def classical_matches(self, text: str, ingredient_ids: set[str]) -> list[ClassicalMatch]:
        """Classical formulations named in `text`, or whose defining set is all present."""
        folded = " " + fold(text) + " "
        matches: list[ClassicalMatch] = []
        for formulation in self.classical:
            if any(" " + fold(name) + " " in folded for name in formulation.names):
                matches.append(ClassicalMatch(formulation, "name"))
            elif formulation.ingredients and set(formulation.ingredients) <= ingredient_ids:
                matches.append(ClassicalMatch(formulation, "ingredients"))
        return matches


def load_vocabulary(path: Path = VOCABULARY_PATH) -> Vocabulary:
    return Vocabulary(json.loads(path.read_text(encoding="utf-8")))


@lru_cache
def get_vocabulary() -> Vocabulary:
    return load_vocabulary()
