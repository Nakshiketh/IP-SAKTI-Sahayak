"""What an index holds and what it returns."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.models.domain import (
    IPRight,
    Jurisdiction,
    ProductClass,
    RegulatoryArea,
    VerificationStatus,
)

#: A namespace is a jurisdiction's index. India and International are separate
#: stores, not a filter over one store — a filter can be forgotten, a separate
#: store cannot be read by accident.
Namespace = Jurisdiction


@dataclass(frozen=True)
class IndexedChunk:
    """A passage in an index, with everything a citation needs.

    Carries its document's identity rather than a foreign key alone, because a
    citation must be renderable from a retrieval result without a second lookup
    that could fail silently and leave a passage cited to nothing.
    """

    chunk_id: str
    document_id: str
    document_title: str
    organization: str
    jurisdiction: Jurisdiction
    text: str
    section_path: tuple[str, ...] = ()
    heading: str | None = None
    page_from: int | None = None
    source_url: str | None = None
    version_label: str | None = None
    document_type: str | None = None
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    effective_from: date | None = None
    effective_to: date | None = None
    superseded_by: str | None = None
    ip_rights: tuple[IPRight, ...] = ()
    regulatory_areas: tuple[RegulatoryArea, ...] = ()
    product_classes: tuple[ProductClass, ...] = ()
    #: Chunk ids this passage is known to be in tension with. Populated by
    #: ingestion when it sees an express override or a superseding instrument;
    #: never inferred from the text at query time.
    conflicts_with: tuple[str, ...] = ()
    #: Terms the ingestion pipeline extracted as what this passage is about.
    #: Indexed alongside the body so a question phrased in a reader's words can
    #: still reach a section phrased in a draftsman's. Extracted, never authored
    #: as a claim about what the passage says.
    topics: tuple[str, ...] = ()

    @property
    def section_label(self) -> str | None:
        return " › ".join(self.section_path) if self.section_path else self.heading

    def within_effective_window(self, on: date) -> bool:
        """Is this passage in force on the given date?

        A passage with no dates at all is treated as in force. That is the only
        defensible reading of "we do not know when this took effect" — the
        alternative, marking every undated passage stale, would abstain on the
        whole corpus before Phase 11 has populated a single date.
        """
        if self.superseded_by is not None:
            return False
        if self.effective_from is not None and on < self.effective_from:
            return False
        return not (self.effective_to is not None and on > self.effective_to)


@dataclass(frozen=True)
class ScoredChunk:
    """A chunk with the scores that put it here.

    Both scores are kept, never collapsed into one. The interface shows them
    separately and the confidence rule reads only the rerank score, so merging
    them would make the rule unstateable.
    """

    chunk: IndexedChunk
    retrieval_score: float
    rerank_score: float | None = None
    #: Which channels proposed it, for the audit trail.
    channels: tuple[str, ...] = ()


@dataclass(frozen=True)
class RetrievalFilters:
    """Metadata pre-filters, applied before scoring rather than after.

    Applied before because a filtered-out passage must never occupy one of the
    candidate slots. Filtering after retrieval quietly shrinks the candidate set
    and makes a thin answer look like a well-supported one.
    """

    #: Passages outside their effective window on this date are excluded.
    effective_on: date | None = None
    document_types: frozenset[str] = frozenset()
    ip_rights: frozenset[IPRight] = frozenset()
    regulatory_areas: frozenset[RegulatoryArea] = frozenset()
    product_classes: frozenset[ProductClass] = frozenset()
    #: When false, superseded passages are kept so the pipeline can report that
    #: what it found is out of date rather than reporting that it found nothing.
    exclude_out_of_window: bool = False
    document_ids: frozenset[str] = field(default_factory=frozenset)

    def matches(self, chunk: IndexedChunk) -> bool:
        if self.document_ids and chunk.document_id not in self.document_ids:
            return False
        if self.document_types and (chunk.document_type or "") not in self.document_types:
            return False
        if self.ip_rights and not self.ip_rights.intersection(chunk.ip_rights):
            return False
        if self.regulatory_areas and not self.regulatory_areas.intersection(chunk.regulatory_areas):
            return False
        if self.product_classes and not self.product_classes.intersection(chunk.product_classes):
            return False
        if self.exclude_out_of_window and self.effective_on is not None:
            return chunk.within_effective_window(self.effective_on)
        return True
