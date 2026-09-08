"""What moves between the ingestion stages.

Deliberately separate from `app.models.domain`. The domain model is a contract
with the frontend, checked for drift against a generated schema; these are
working shapes that exist between a fetch and an index write and are never
serialised to a client. Putting them in the domain module would put the parser's
intermediate representation into the frontend's type contract.

`SegmentedChunk` is the exception that proves the rule: it is converted to
`IndexedChunk` by the index writer, because that *is* the shape retrieval reads.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum


class AccessMode(StrEnum):
    """How a source may be obtained. The pipeline reads this before anything else.

    ``USER_CREDENTIALED`` is the one that matters: those sources are never
    fetched here, at any point, under any flag. They are reached only at query
    time, through the reader's own credentials, with logged consent.
    """

    OPEN = "open"
    BULK_OPEN = "bulk_open"
    PORTAL_LINK_ONLY = "portal_link_only"
    USER_CREDENTIALED = "user_credentialed"


class Outcome(StrEnum):
    OK = "ok"
    #: Nothing to do — no source URL, or the raw file is already current.
    SKIPPED = "skipped"
    #: A gate failed. The document does not enter the index.
    FAILED = "failed"


@dataclass
class StageOutcome:
    stage: str
    document_id: str
    outcome: Outcome
    reason: str = ""
    detail: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.outcome is Outcome.OK


@dataclass(frozen=True)
class DocumentEntry:
    """One manifest row, read rather than trusted.

    Every field that would be a claim about the document — the URL it came from,
    when it took effect, which version it is, what it hashes to — is optional,
    and is null until the document has actually been fetched.
    """

    document_id: str
    title: str
    organization: str
    jurisdiction: str
    regime_family: str
    document_type: str
    parser: str
    chunking_profile: str
    access_mode: AccessMode = AccessMode.OPEN
    short_title: str | None = None
    language: str = "en"
    source_url: str | None = None
    version_label: str | None = None
    effective_from: date | None = None
    effective_to: date | None = None
    supersedes: tuple[str, ...] = ()
    superseded_by: str | None = None
    publication_date: date | None = None
    retrieved_at: datetime | None = None
    verification_status: str = "unverified"
    checksum: str | None = None
    licence: str | None = None
    attribution_text: str | None = None
    #: Document-level tags. A floor under every chunk's own tags, never a
    #: replacement for them: a chunk about labelling in a drugs act still
    #: carries the act's tags.
    ip_rights: tuple[str, ...] = ()
    regulatory_areas: tuple[str, ...] = ()
    product_classes: tuple[str, ...] = ()
    notes: str | None = None

    @property
    def fetchable(self) -> bool:
        """Can this be fetched at all?

        False for a source nobody has verified a URL for, and false — always —
        for a credentialed source. The second is not a configuration question.
        """
        if self.access_mode in (AccessMode.USER_CREDENTIALED, AccessMode.PORTAL_LINK_ONLY):
            return False
        return bool(self.source_url)


@dataclass(frozen=True)
class Block:
    """A run of text as the parser found it, with where it was found.

    ``page`` survives all the way to a citation. A reader who opens a source
    needs the page, and a page recovered later by searching for the text is a
    page that can be wrong.
    """

    text: str
    page: int | None = None
    #: True when the parser identified this as a heading rather than body text.
    #: The segmenter uses it as a hint, never as the only signal — plenty of
    #: statutory headings are not marked up as headings anywhere.
    is_heading: bool = False


@dataclass(frozen=True)
class ParsedDocument:
    document_id: str
    blocks: tuple[Block, ...]
    parser: str
    #: True when the text came from optical character recognition, so downstream
    #: can treat it with the suspicion it deserves.
    ocr: bool = False
    #: Mean OCR confidence, 0 to 1, where OCR ran. None otherwise.
    ocr_confidence: float | None = None
    page_count: int | None = None


@dataclass(frozen=True)
class SegmentedChunk:
    chunk_id: str
    document_id: str
    text: str
    section_path: tuple[str, ...]
    heading: str | None
    page_from: int | None
    page_to: int | None
    token_count: int
    #: Content hash of the text, before tagging. Two ingests of the same wording
    #: produce the same hash and therefore the same id, which is what makes the
    #: version diff meaningful rather than a wall of churn.
    content_hash: str = ""
    #: The stable identity of "this section of this document", carried across
    #: versions. The chunk id is this plus a content hash, so a re-ingest can
    #: tell a section whose wording changed from a section that is simply gone.
    section_key: str = ""
    ip_rights: tuple[str, ...] = ()
    regulatory_areas: tuple[str, ...] = ()
    product_classes: tuple[str, ...] = ()
    effective_from: date | None = None
    effective_to: date | None = None
    embedding_ref: str | None = None
    conflicts_with: tuple[str, ...] = ()
    topics: tuple[str, ...] = ()


@dataclass
class IngestReport:
    """What a run did, in the order it did it.

    Printed by the CLI and asserted on by tests. It carries skips and failures
    with their reasons rather than a count, because "31 documents skipped" is
    not something anyone can act on.
    """

    outcomes: list[StageOutcome] = field(default_factory=list)
    chunks_written: int = 0
    documents_indexed: int = 0
    corpus_version: str = ""

    def add(self, outcome: StageOutcome) -> StageOutcome:
        self.outcomes.append(outcome)
        return outcome

    def failures(self) -> list[StageOutcome]:
        return [o for o in self.outcomes if o.outcome is Outcome.FAILED]

    def skips(self) -> list[StageOutcome]:
        return [o for o in self.outcomes if o.outcome is Outcome.SKIPPED]

    @property
    def failed(self) -> bool:
        return bool(self.failures())
