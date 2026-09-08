"""Tagging a chunk with what it is about, and what may enter the index.

Two taggers, and the difference between them is the whole design.

`RuleTagger` runs the same lexicon the query-understanding stage runs. That is
not a shortcut — it is the point. A question is mapped to rights and regulatory
areas by one vocabulary, and a passage is mapped by the same one, so a
pre-filter on "labelling" means the same thing on both sides of a retrieval. Two
vocabularies would drift, and the drift would show up as a filter that quietly
excludes the passage the reader needed.

`LLMTagger` writes to `corpus/tags-review.jsonl` and **nothing it produces
enters the index**. A model's guess about which regulatory area a provision
belongs to is a claim about law, and this product does not let a machine make
one unreviewed. The review file is the queue; a person moves a tag from there
into the manifest, and then it is a human's tag.

The document's own tags are a floor, not a replacement. A chunk about labelling
inside a drugs act still carries the act's tags, because a reader filtering by
"drug regulation" should still find it.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import date
from pathlib import Path
from typing import Protocol

from app.corpus.types import DocumentEntry, SegmentedChunk
from app.retrieval.tokenize import tokenize
from app.services.understanding import Lexicon, get_lexicon, matching_keys

#: How many of a chunk's most distinctive words are kept as topics. They are
#: what a question is matched against alongside the body, so they are extracted
#: from the text rather than authored — a topic nobody can point at in the
#: passage is a claim about the passage.
TOPIC_COUNT = 12

#: Words too common in this corpus to distinguish one passage from another.
_TOPIC_STOPWORDS = frozenset(
    {
        "section",
        "sub",
        "clause",
        "rule",
        "act",
        "sha",
        "provided",
        "thereof",
        "therein",
        "hereby",
        "shall",
        "may",
        "any",
        "such",
        "person",
        "case",
        "made",
    }
)


class ChunkTagger(Protocol):
    name: str

    @property
    def enters_index(self) -> bool: ...

    def tag(self, chunk: SegmentedChunk, entry: DocumentEntry) -> SegmentedChunk: ...


class RuleTagger:
    """The query lexicon, run over a passage. Deterministic, reviewable, indexed."""

    name = "rules"

    def __init__(self, lexicon: Lexicon | None = None) -> None:
        self._lexicon = lexicon or get_lexicon()

    @property
    def enters_index(self) -> bool:
        return True

    def tag(self, chunk: SegmentedChunk, entry: DocumentEntry) -> SegmentedChunk:
        haystack = " ".join([chunk.heading or "", *chunk.section_path, chunk.text])
        tokens = tokenize(haystack, drop_stopwords=False)

        def matches(section: dict[str, tuple[tuple[str, ...], ...]]) -> tuple[str, ...]:
            return matching_keys(tokens, section)

        return replace(
            chunk,
            ip_rights=_union(entry.ip_rights, matches(self._lexicon.ip_rights)),
            regulatory_areas=_union(
                entry.regulatory_areas, matches(self._lexicon.regulatory_areas)
            ),
            product_classes=_union(
                entry.product_classes, matches(self._lexicon.product_class_hints)
            ),
            topics=_topics(chunk),
            effective_from=chunk.effective_from or entry.effective_from,
            effective_to=chunk.effective_to or entry.effective_to,
        )


class LLMTagger:
    """A model's suggestions, written to a review queue and never indexed.

    Deliberately not wired to a model in this phase. What it *is* is the shape
    of the queue: one JSON object per chunk, carrying what the rules already
    found and what a model would add, so a reviewer can see the difference
    rather than a wall of tags. Turning it on is a matter of passing an
    `LLMClient`; letting its output into the index is not a matter of
    configuration at all.
    """

    name = "llm"

    def __init__(self, review_path: Path) -> None:
        self._review_path = review_path

    @property
    def enters_index(self) -> bool:
        return False

    def propose(self, chunk: SegmentedChunk, entry: DocumentEntry) -> dict:
        return {
            "chunk_id": chunk.chunk_id,
            "document_id": entry.document_id,
            "section_path": list(chunk.section_path),
            "heading": chunk.heading,
            "rules_tags": {
                "ip_rights": list(chunk.ip_rights),
                "regulatory_areas": list(chunk.regulatory_areas),
                "product_classes": list(chunk.product_classes),
            },
            "proposed_tags": None,
            "reviewed": False,
            "reviewer_note": None,
        }

    def write(self, rows: list[dict]) -> None:
        self._review_path.parent.mkdir(parents=True, exist_ok=True)
        with self._review_path.open("w", encoding="utf-8", newline="\n") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _union(*groups: tuple[str, ...]) -> tuple[str, ...]:
    seen: dict[str, None] = {}
    for group in groups:
        for value in group:
            seen.setdefault(value, None)
    return tuple(seen)


def _topics(chunk: SegmentedChunk) -> tuple[str, ...]:
    """The passage's own distinctive words, in order of first appearance.

    Extraction, not authorship. Every topic is a word that is actually in the
    passage or its heading, so a reader who opens the source can find it.
    """
    fields = tokenize(" ".join([chunk.heading or "", *chunk.section_path]))
    body = tokenize(chunk.text)
    ordered: list[str] = []
    for token in [*fields, *body]:
        if token in _TOPIC_STOPWORDS or token.isdigit() or len(token) < 4:
            continue
        if token not in ordered:
            ordered.append(token)
        if len(ordered) >= TOPIC_COUNT:
            break
    return tuple(ordered)


def enrich(
    chunks: list[SegmentedChunk],
    entry: DocumentEntry,
    *,
    tagger: ChunkTagger | None = None,
    review: LLMTagger | None = None,
    ingested_on: date | None = None,
) -> tuple[list[SegmentedChunk], list[dict]]:
    del ingested_on  # effective dates come from the document, never from today
    rule_tagger = tagger or RuleTagger()
    tagged = [rule_tagger.tag(chunk, entry) for chunk in chunks]
    proposals = [review.propose(chunk, entry) for chunk in tagged] if review else []
    return tagged, proposals
