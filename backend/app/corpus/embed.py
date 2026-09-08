"""Vectors, and the honest absence of them.

There is no embedding model in this repository and no vectors are built. That is
stated here rather than worked around, because the alternative — shipping a
weak embedder so the stage "passes" — would put a dense channel into retrieval
that returns plausible-looking noise, and noise that scores is worse than a
channel that says it is not there.

So `NullEmbedder` writes nothing, reports itself unavailable, and leaves
`embedding_ref` null on every chunk. `app.retrieval.channels.NullDenseChannel`
already declares the matching absence on the read side, and the interface's
stage detail shows one channel running rather than two. When a model arrives,
this is where it goes, and the only thing that changes downstream is that the
dense channel starts returning ids.

The interface below is what a real embedder has to satisfy: encode a batch,
report its dimension and its identity, and hand back a reference per chunk that
the vector store can resolve. The model identity is recorded on the index so a
corpus embedded with one model is never silently queried with another.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Protocol

from app.corpus.types import SegmentedChunk


@dataclass(frozen=True)
class EmbeddingResult:
    chunks: tuple[SegmentedChunk, ...]
    #: Identity of the model that produced the vectors, recorded on the index.
    model: str | None
    dimension: int | None
    vectors_written: int


class Embedder(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    @property
    def dimension(self) -> int | None: ...

    def embed(self, chunks: list[SegmentedChunk], namespace: str) -> EmbeddingResult: ...


class NullEmbedder:
    """No model, no vectors, and it says so."""

    name = "none"

    @property
    def available(self) -> bool:
        return False

    @property
    def dimension(self) -> int | None:
        return None

    def embed(self, chunks: list[SegmentedChunk], namespace: str) -> EmbeddingResult:
        del namespace
        return EmbeddingResult(
            chunks=tuple(replace(chunk, embedding_ref=None) for chunk in chunks),
            model=None,
            dimension=None,
            vectors_written=0,
        )
