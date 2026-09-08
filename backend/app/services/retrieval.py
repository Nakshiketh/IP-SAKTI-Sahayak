"""The retrieval stage: candidates, fusion, reranking, contradictions.

Reads exactly one namespace. The store it is handed already contains only one
jurisdiction's passages, so there is no filter here to forget.

Order of operations, and why:

1. Metadata pre-filters run first, over the whole store. Filtering afterwards
   would let excluded passages occupy candidate slots and make a thin result
   look like a well-supported one.
2. Each channel proposes an ordering over the survivors.
3. Reciprocal rank fusion merges the orderings. Rank, not score — the channels
   do not share a scale.
4. The reranker scores the fused top of the list on [0, 1]. That number, and
   only that number, is what the confidence rule reads.
5. Contradictions are found last, over what survived.

Passages outside their effective window are kept, not dropped. Dropping them
would turn "everything I found on this has been superseded" into "I found
nothing", and those are different things to tell a reader.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.retrieval.channels import Channel, LexicalChannel, NullDenseChannel
from app.retrieval.fusion import reciprocal_rank_fusion
from app.retrieval.rerank import LexicalReranker, Reranker
from app.retrieval.store import ChunkStore
from app.retrieval.types import IndexedChunk, RetrievalFilters, ScoredChunk


@dataclass(frozen=True)
class RetrievalResult:
    passages: tuple[ScoredChunk, ...]
    #: Pairs of chunk ids found to be in tension. Never inferred from wording.
    contradictions: tuple[tuple[str, str], ...]
    #: How many passages were in play before scoring, for the stage detail.
    candidates_considered: int
    #: Channels that actually ran. A channel with no implementation says so
    #: here rather than appearing to have run and found nothing.
    channels_used: tuple[str, ...]
    channels_unavailable: tuple[str, ...]
    reranker: str
    documents_searched: int


def find_contradictions(passages: list[ScoredChunk]) -> tuple[tuple[str, str], ...]:
    """Which of these passages are in tension with each other.

    Two sources, both from ingestion, never from reading the text at query time:

    * a chunk that names another retrieved chunk in ``conflicts_with``, which
      ingestion sets when it sees an express override; and
    * a chunk superseded by a document another retrieved chunk belongs to.

    Detecting a contradiction by comparing wording is a thing this product
    deliberately does not do. It would be guessing, and the consequence of
    guessing wrong here is showing one side of a genuine disagreement as
    settled.
    """
    by_id = {passage.chunk.chunk_id: passage.chunk for passage in passages}
    documents = {passage.chunk.document_id: passage.chunk.chunk_id for passage in passages}
    found: set[tuple[str, str]] = set()

    for passage in passages:
        chunk = passage.chunk
        for other_id in chunk.conflicts_with:
            if other_id in by_id:
                found.add(tuple(sorted((chunk.chunk_id, other_id))))  # type: ignore[arg-type]
        if chunk.superseded_by and chunk.superseded_by in documents:
            found.add(tuple(sorted((chunk.chunk_id, documents[chunk.superseded_by]))))  # type: ignore[arg-type]

    return tuple(sorted(found))


class Retriever:
    def __init__(
        self,
        *,
        channels: tuple[Channel, ...] | None = None,
        reranker: Reranker | None = None,
        fusion_k: int = 60,
    ) -> None:
        self._channels: tuple[Channel, ...] = channels or (LexicalChannel(), NullDenseChannel())
        self._reranker: Reranker = reranker or LexicalReranker()
        self._fusion_k = fusion_k

    def retrieve(
        self,
        query: str,
        store: ChunkStore,
        *,
        filters: RetrievalFilters,
        candidates: int,
        keep: int,
        on: date,
    ) -> RetrievalResult:
        pool: list[IndexedChunk] = [chunk for chunk in store.chunks() if filters.matches(chunk)]

        rankings: dict[str, list[str]] = {}
        used: list[str] = []
        unavailable: list[str] = []
        for channel in self._channels:
            if not channel.available:
                unavailable.append(channel.name)
                continue
            used.append(channel.name)
            rankings[channel.name] = list(channel.search(query, pool, candidates))

        fused = reciprocal_rank_fusion(rankings, k=self._fusion_k, limit=candidates)
        by_id = {chunk.chunk_id: chunk for chunk in pool}
        fused_chunks = [
            ScoredChunk(
                chunk=by_id[chunk_id],
                retrieval_score=round(score, 6),
                channels=channels,
            )
            for chunk_id, score, channels in fused
            if chunk_id in by_id
        ]

        reranked = self._reranker.rerank(query, fused_chunks, keep)
        return RetrievalResult(
            passages=tuple(reranked),
            contradictions=find_contradictions(reranked),
            candidates_considered=len(pool),
            channels_used=tuple(used),
            channels_unavailable=tuple(unavailable),
            reranker=self._reranker.name,
            documents_searched=len({chunk.document_id for chunk in pool}),
        )
