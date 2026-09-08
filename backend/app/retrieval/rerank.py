"""Reranking: turning an ordering into a number the confidence rule can read.

The retrieval channels put passages in order. Order is not enough for anything
downstream: the confidence rule needs to know whether the best passage is a good
match in absolute terms, and "it came first" says nothing about that when
everything found was noise.

So a reranker returns a score in [0, 1], and the two thresholds in
`app.services.confidence` are stated against that scale. This is the contract a
cross-encoder has to honour when one is configured, and the reason
`LexicalReranker` normalises rather than returning a raw overlap count.

`LexicalReranker` is not a cross-encoder and does not pretend to be. It measures
how much of the question a passage actually covers, weighting rarer terms more,
and adds a smaller term for whether the passage's title, section path, heading
and topics are about the question rather than merely containing its words. It is
what can be computed with no model present, it is calibrated, and its scores are
shown to the reader in the stage detail rather than hidden.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Protocol

from app.retrieval.tokenize import tokenize
from app.retrieval.types import IndexedChunk, ScoredChunk

#: A passage's score is built from three readings of the same overlap, because
#: no one of them is a fair measure on its own.
#:
#:   REACH     how much of the question this passage covers. Falls as questions
#:             get longer, which is right — a long question is harder to answer
#:             from one passage — but on its own it would score every passage
#:             low for any question containing a word the corpus never uses.
#:   STANDING  how much of what the corpus *can* speak to this passage covers.
#:             Terms no passage anywhere matched are excluded: a word absent
#:             from the whole candidate set says nothing about which passage is
#:             better, and letting it drag every score down would abstain on
#:             questions the corpus answers perfectly well.
#:   LABELLING whether the passage's own title, section path, heading and topics
#:             are about the question, rather than merely containing its words.
#:
#: Standing alone would be the dangerous one: where a question shares a single
#: word with a single passage, that passage covers all of what the corpus can
#: speak to, and would score 1.0 on one accidental match. Reach dampens that but
#: does not stop it, so a passage matching fewer distinct terms than
#: `TERMS_FOR_FULL_CREDIT` has its whole score scaled down in proportion. One
#: word in common is a coincidence; two is the beginning of a match.
REACH_WEIGHT = 0.3
STANDING_WEIGHT = 0.45
LABELLING_WEIGHT = 0.25
TERMS_FOR_FULL_CREDIT = 2


class Reranker(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    def rerank(self, query: str, candidates: list[ScoredChunk], keep: int) -> list[ScoredChunk]: ...


class LexicalReranker:
    """Weighted query coverage, normalised to [0, 1]."""

    name = "lexical-coverage"

    @property
    def available(self) -> bool:
        return True

    def rerank(self, query: str, candidates: list[ScoredChunk], keep: int) -> list[ScoredChunk]:
        terms = list(dict.fromkeys(tokenize(query)))
        if not terms or not candidates:
            return []

        weights = self._weights(terms, candidates)
        reachable = sum(weights.values()) or 1.0

        covered: list[tuple[ScoredChunk, float, float, int]] = []
        findable: set[str] = set()
        for candidate in candidates:
            fields = set(tokenize(self._field_text(candidate.chunk)))
            everything = set(tokenize(candidate.chunk.text)) | fields
            hits = [term for term in terms if term in everything]
            findable.update(hits)
            covered.append(
                (
                    candidate,
                    sum(weights[term] for term in hits),
                    sum(1 for term in terms if term in fields) / len(terms),
                    len(hits),
                )
            )

        # The terms the candidate set can speak to at all. Empty means nothing
        # matched anywhere, and every score below is zero — which is the honest
        # result, and the one that makes the pipeline abstain.
        standing_total = sum(weights[term] for term in findable) or 1.0

        scored: list[ScoredChunk] = []
        for candidate, weight, labelling, hits in covered:
            breadth = min(1.0, hits / min(TERMS_FOR_FULL_CREDIT, len(terms)))
            score = breadth * (
                REACH_WEIGHT * (weight / reachable)
                + STANDING_WEIGHT * (weight / standing_total)
                + LABELLING_WEIGHT * labelling
            )
            scored.append(
                ScoredChunk(
                    chunk=candidate.chunk,
                    retrieval_score=candidate.retrieval_score,
                    rerank_score=round(min(1.0, score), 4),
                    channels=candidate.channels,
                )
            )

        scored.sort(key=lambda item: (-(item.rerank_score or 0.0), item.chunk.chunk_id))
        return scored[:keep]

    @staticmethod
    def _field_text(chunk: IndexedChunk) -> str:
        parts = [chunk.document_title, *chunk.section_path, *chunk.topics]
        if chunk.heading:
            parts.append(chunk.heading)
        return "\n".join(parts)

    @staticmethod
    def _weights(terms: list[str], candidates: list[ScoredChunk]) -> dict[str, float]:
        """Rarer terms count for more, floored so no term counts for nothing.

        A term every candidate contains says nothing about which candidate to
        prefer, but zero-weighting it would let a passage covering only the
        common words score as well as one covering the distinctive ones. The
        floor keeps the ordering sane while still preferring the rare match.
        """
        occurrences: Counter[str] = Counter()
        for candidate in candidates:
            present = set(tokenize(candidate.chunk.text)) | set(
                tokenize(LexicalReranker._field_text(candidate.chunk))
            )
            occurrences.update(term for term in terms if term in present)

        n = len(candidates)
        return {
            term: max(0.25, math.log(1.0 + n / (occurrences.get(term, 0) + 0.5))) for term in terms
        }


class PassthroughReranker:
    """Keeps the scores the store already supplied.

    Used only where a store hands back passages that were scored elsewhere. It
    exists so that path is visible in the stage record as a reranker that did
    not run, rather than as a rerank stage that silently did nothing.
    """

    name = "passthrough"

    @property
    def available(self) -> bool:
        return False

    def rerank(self, query: str, candidates: list[ScoredChunk], keep: int) -> list[ScoredChunk]:
        ordered = sorted(
            candidates,
            key=lambda item: (-(item.rerank_score or item.retrieval_score), item.chunk.chunk_id),
        )
        return ordered[:keep]
