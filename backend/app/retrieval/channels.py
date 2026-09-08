"""The two retrieval channels, behind one shape.

A channel takes a query and returns ids in order. It does not return scores,
because fusion reads rank and nothing downstream should be tempted to compare a
BM25 score against a cosine similarity.

The dense channel has no implementation that runs today. That is stated rather
than faked: `NullDenseChannel.available` is false, retrieval records that only
one channel ran, and the interface's stage detail shows it. An embedding model
and a built vector index arrive with the corpus in Phase 11, and the fusion
above this needs no change when they do.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.retrieval.bm25 import Bm25Index
from app.retrieval.types import IndexedChunk


@runtime_checkable
class Channel(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    def search(self, query: str, candidates: list[IndexedChunk], limit: int) -> list[str]: ...


class LexicalChannel:
    """BM25 over the candidate set.

    The index is built over the candidates that survived metadata filtering, not
    over the whole store. That costs a rebuild per query and buys the property
    that matters: idf is computed over the passages actually in play, so a term
    common in the whole corpus but rare among, say, the labelling passages still
    counts for something.
    """

    name = "lexical"

    @property
    def available(self) -> bool:
        return True

    def search(self, query: str, candidates: list[IndexedChunk], limit: int) -> list[str]:
        if not candidates:
            return []
        index = Bm25Index.build(
            [(chunk.chunk_id, self._indexed_text(chunk)) for chunk in candidates]
        )
        return [chunk_id for chunk_id, _score in index.search(query, limit)]

    @staticmethod
    def _indexed_text(chunk: IndexedChunk) -> str:
        """Heading and section path are indexed with the body.

        Someone asking about "manufacture for sale" is often typing the heading
        rather than anything in the body, and a section whose path names the
        chapter is a better match for a question about that chapter.
        """
        parts = [chunk.document_title, *chunk.section_path, *chunk.topics]
        if chunk.heading:
            parts.append(chunk.heading)
        parts.append(chunk.text)
        return "\n".join(parts)


class NullDenseChannel:
    """The dense channel, absent.

    Returns nothing and says it is unavailable. It exists so the fusion, the
    stage record and the audit row all have the shape they will have once an
    embedding index is built, and so nothing downstream has to learn about a
    second channel later.
    """

    name = "dense"

    @property
    def available(self) -> bool:
        return False

    def search(self, query: str, candidates: list[IndexedChunk], limit: int) -> list[str]:
        return []
