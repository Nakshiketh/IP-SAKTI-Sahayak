"""Retrieval: the indexes, the channels over them, and the fusion between them.

Kept out of `app.services` on purpose. `app.services` holds *stages of the
pipeline* — things that happen to one query on its way to one answer. This
package holds the stores those stages read, which have their own lifetime and
are built by the ingestion scripts rather than by a request.

Two channels, fused. Lexical matching finds a section by the words in it, which
is what a statutory query mostly is: someone typing a term of art. Dense
matching finds a section that says the same thing in different words, which is
what a question in Hindi about an English act needs. Neither alone is enough,
and reciprocal rank fusion is used rather than a score blend because the two
channels' scores are not on a comparable scale and pretending otherwise would
put a thumb on whichever one happened to produce larger numbers.
"""

from app.retrieval.types import (
    IndexedChunk,
    Namespace,
    RetrievalFilters,
    ScoredChunk,
)

__all__ = ["IndexedChunk", "Namespace", "RetrievalFilters", "ScoredChunk"]
