"""Questions that are really several questions, and what to do about them.

A person with a hard problem does not ask one thing. They ask seven, in one
paragraph, numbered, because that is how the problem actually sits in their
head. Retrieval handles that badly: the reranker scores a passage against the
whole paragraph, so a passage that answers part four perfectly is scored against
parts one to seven as well and comes out looking irrelevant. On the flagship
case nothing cleared the retrieval floor at all — top score 0.18, against 0.75
for the same corpus when one part was asked on its own.

So the parts are separated and retrieved for one at a time, and the results are
merged. Nothing about the answer changes: the same passages, the same citation
verification, the same confidence rule. What changes is that a passage is scored
against the question it actually answers.

Splitting is conservative on purpose. Only explicit enumeration is treated as a
list — "(1) ... (2) ...", "1. ... 2. ...", or several sentences that each end in
a question mark. Prose is left alone, because guessing where a sentence divides
into two questions would split a single question that happens to contain "and"
and score both halves against the wrong thing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.retrieval.types import ScoredChunk

#: "(1)" or "(a)" — an enumeration the writer put there deliberately.
_BRACKETED = re.compile(r"\(\s*(?:\d{1,2}|[a-h])\s*\)")
#: "1." or "2)" at a clause boundary. Requires the separator before it, so a
#: decimal or a rule number inside a sentence is not mistaken for a list.
_NUMBERED = re.compile(r"(?:(?<=^)|(?<=[;:.]\s)|(?<=\n))\s*\d{1,2}[.)]\s+")
#: A sentence that ends in a question mark is its own question.
_QUESTIONS = re.compile(r"[^.?!]*\?")

#: Below this many words a fragment is not a question, it is a leftover.
_MIN_WORDS = 3
#: More than this and the split is not helping; the whole question is used.
_MAX_PARTS = 10


@dataclass(frozen=True)
class Part:
    """One question inside a longer one."""

    part_id: str
    #: What is retrieved for: this part alone, in the writer's words.
    text: str
    #: The background the parts were introduced by. Shown with the section, so
    #: a reader sees what the parts were about; never searched on.
    context: str = ""


def _clean(text: str) -> str:
    return " ".join(text.replace("\n", " ").split()).strip(" ;:,.")


def _usable(fragments: list[str]) -> list[str]:
    return [
        cleaned
        for fragment in fragments
        if len((cleaned := _clean(fragment)).split()) >= _MIN_WORDS
    ]


def split_question(question: str) -> tuple[Part, ...]:
    """The parts of this question, or one part when it is only one question.

    Always returns at least one part, so a caller never has to branch on empty.
    """
    whole = _clean(question)
    if not whole:
        return ()

    for pattern in (_BRACKETED, _NUMBERED):
        if len(pattern.findall(question)) >= 2:
            fragments = _usable(pattern.split(question))
            # The text before the first marker is the stem — everything from
            # "We are an Indian Ayurveda startup" to "We want to:". It is kept
            # as context but never prefixed to the parts: prefixing sixty words
            # of background to each one would put back exactly the dilution
            # this split exists to remove.
            if len(fragments) >= 2:
                stem, *rest = fragments
                parts = rest if len(rest) >= 2 else fragments
                if len(parts) <= _MAX_PARTS:
                    context = stem if parts is rest else ""
                    return tuple(
                        Part(part_id=f"p{index + 1}", text=text, context=context)
                        for index, text in enumerate(parts)
                    )

    questions = _usable(_QUESTIONS.findall(question))
    if len(questions) >= 2 and len(questions) <= _MAX_PARTS:
        return tuple(
            Part(part_id=f"p{index + 1}", text=text) for index, text in enumerate(questions)
        )

    return (Part(part_id="p1", text=whole),)


def merge_parts(
    results: list[tuple[Part, list[ScoredChunk]]],
) -> tuple[list[ScoredChunk], dict[str, str]]:
    """One passage list from several retrievals, and which part each answered.

    A passage found for more than one part keeps its best score, because the
    best score is the one that reflects the question it genuinely answers. The
    map from passage to part is what lets the interface say "this is the part
    of your question this passage speaks to" instead of presenting one
    undifferentiated list.
    """
    best: dict[str, ScoredChunk] = {}
    answered: dict[str, str] = {}
    for part, passages in results:
        for passage in passages:
            chunk_id = passage.chunk.chunk_id
            current = best.get(chunk_id)
            if current is None or (passage.rerank_score or 0) > (current.rerank_score or 0):
                best[chunk_id] = passage
                answered[chunk_id] = part.part_id
    ordered = sorted(best.values(), key=lambda p: p.rerank_score or 0, reverse=True)
    return ordered, answered
