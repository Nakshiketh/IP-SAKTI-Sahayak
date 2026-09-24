"""Verifying what the generator claimed to be citing.

Nothing the generator returns is trusted. Every passage id it named is checked
against the ids actually packed into its context, and a claim naming an id that
was never shown to it has its citation removed. This is the step that turns
"the model said it cited section X" into "this sentence points at a passage that
exists".

What happens to a claim whose citation does not verify is the part worth being
exact about. It is not deleted and it is not silently kept: it is **dropped from
the answer entirely**, because a sentence written to rest on a passage, whose
passage turns out not to exist, is a sentence whose grounds are unknown. A claim
that never carried a citation is different — that is framing, it is kept, and
the interface marks it as unsourced.

If too much drops, the answer is not merely weaker, it is a different answer
from the one the generator wrote. `DROP_LIMIT` is where that line is drawn.
Beyond it the pipeline abstains rather than shipping the remainder.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.llm.types import GenerationResult
from app.models.domain import (
    AnswerBlock,
    AnswerBlockKind,
    Citation,
    Claim,
    VerificationStatus,
)
from app.registry.store import SourceRegistry
from app.retrieval.types import ScoredChunk

#: Share of cited claims that may be dropped before the answer is abandoned.
#: A third is a judgement, not a measurement, and it is written here as one
#: number so it can be argued with rather than found in a condition.
DROP_LIMIT = 1 / 3


@dataclass(frozen=True)
class MappedAnswer:
    blocks: tuple[AnswerBlock, ...]
    citations: tuple[Citation, ...]
    #: Claims removed because their citation did not verify.
    dropped_claims: tuple[str, ...] = ()
    #: True when so much dropped that what is left is not the answer written.
    collapsed: bool = False
    unverifiable_ids: tuple[str, ...] = field(default_factory=tuple)


def build_citations(
    passages: list[ScoredChunk],
    *,
    as_of: date,
    corpus_version: str | None = None,
    registry: SourceRegistry | None = None,
) -> dict[str, Citation]:
    """One citation per retrieved passage, keyed by chunk id.

    ``citation_id`` is the chunk id. A citation is a pointer to a passage, and
    giving it a second identity would mean two things to keep in step and one
    more place for a claim to point at nothing.
    """
    del corpus_version  # carried on the Answer, not on each citation
    citations: dict[str, Citation] = {}
    for passage in passages:
        chunk = passage.chunk
        # The registry, where one is built, says how far this source has been
        # checked. Without it the fields stay null rather than claiming a
        # verification that nobody performed.
        record = registry.get(chunk.document_id) if registry is not None else None
        citations[chunk.chunk_id] = Citation(
            citation_id=chunk.chunk_id,
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            document_title=chunk.document_title,
            organization=chunk.organization,
            jurisdiction=chunk.jurisdiction,
            section_label=chunk.section_label,
            page=chunk.page_from,
            url=chunk.source_url,
            retrieval_score=passage.retrieval_score,
            rerank_score=passage.rerank_score,
            verification_status=chunk.verification_status,
            as_of_date=as_of,
            review_state=record.review_state.value if record else None,
            reviewed_at=record.reviewed_at if record else None,
            provenance_pending=bool(record and record.provenance_pending),
        )
    return citations


def map_citations(
    generated: GenerationResult,
    *,
    citations: dict[str, Citation],
    supplied_ids: set[str],
) -> MappedAnswer:
    blocks: list[AnswerBlock] = []
    dropped: list[str] = []
    unverifiable: set[str] = set()
    cited_claims = 0
    used: set[str] = set()

    for index, block in enumerate(generated.blocks):
        claims: list[Claim] = []
        for claim in block.claims:
            named = list(dict.fromkeys(claim.passage_ids))
            if not named:
                claims.append(Claim(text=claim.text.strip(), citation_ids=[]))
                continue

            cited_claims += 1
            verified = [
                passage_id
                for passage_id in named
                if passage_id in supplied_ids and passage_id in citations
            ]
            unverifiable.update(passage_id for passage_id in named if passage_id not in verified)
            if not verified:
                dropped.append(claim.text.strip())
                continue

            used.update(verified)
            claims.append(Claim(text=claim.text.strip(), citation_ids=verified))

        if not claims:
            continue
        blocks.append(
            AnswerBlock(
                id=block.kind.value + "-" + str(index),
                kind=block.kind,
                text=" ".join(claim.text for claim in claims),
                citation_ids=sorted({cid for claim in claims for cid in claim.citation_ids}),
                claims=claims,
            )
        )

    collapsed = _collapsed(blocks, dropped_count=len(dropped), cited_claims=cited_claims)

    # Only the citations something actually points at are carried on the answer.
    # A source list containing an entry no claim references invites a reader to
    # believe the answer rested on it.
    kept = tuple(citations[chunk_id] for chunk_id in citations if chunk_id in used)
    return MappedAnswer(
        blocks=tuple(blocks),
        citations=kept,
        dropped_claims=tuple(dropped),
        collapsed=collapsed,
        unverifiable_ids=tuple(sorted(unverifiable)),
    )


def _collapsed(blocks: list[AnswerBlock], *, dropped_count: int, cited_claims: int) -> bool:
    if not any(block.kind is AnswerBlockKind.ANSWER for block in blocks):
        return True
    if not any(block.citation_ids for block in blocks):
        return True
    return bool(cited_claims) and dropped_count / cited_claims > DROP_LIMIT


def demo_present(citations: tuple[Citation, ...]) -> bool:
    return any(citation.verification_status is VerificationStatus.DEMO for citation in citations)
