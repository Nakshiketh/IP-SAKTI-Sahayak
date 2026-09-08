"""What the records layer holds.

`StoredRecord` wraps the domain `Record` rather than replacing it: the domain
model is the shape the frontend has a contract with, and the two extra fields
here — the original row as it arrived, and a hash of it — are storage concerns
that no client needs. Keeping the raw row is what makes a mapping arguable
later: if a field turns out to have been mapped wrongly, the evidence for what
the source actually said is still there.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum

from app.models.domain import Record


class RecordAccessMode(StrEnum):
    """How a records source may be obtained.

    ``PORTAL_LINK_ONLY`` is the one with teeth. Those services are interactive
    and session-based, their terms generally prohibit automated retrieval, and
    the product links out rather than claiming to have run the search. There is
    no fetcher for them anywhere in this codebase.
    """

    BULK_OPEN = "bulk_open"
    API_OPEN = "api_open"
    PORTAL_LINK_ONLY = "portal_link_only"


@dataclass(frozen=True)
class RecordSource:
    source_id: str
    name: str
    publisher: str
    jurisdiction: str
    record_type: str
    access_mode: RecordAccessMode
    #: Every licence field is null until a person has read the terms. A source
    #: whose licence is unread is not ingested, and one whose licence is unclear
    #: is treated as portal-only.
    licence: str | None = None
    licence_url: str | None = None
    #: Rendered verbatim wherever the source is shown. Open government data
    #: typically requires exactly this and prohibits implying endorsement.
    attribution_text: str | None = None
    source_url: str | None = None
    update_cadence: str = "unknown_until_verified"
    last_snapshot_at: datetime | None = None
    snapshot_checksum: str | None = None
    record_count: int | None = None
    terms_note: str = ""
    parser: str | None = None
    field_map: dict[str, str | None] = field(default_factory=dict)
    #: A deep link with placeholders, for a portal the product does not search.
    link_template: str | None = None

    @property
    def ingestible(self) -> bool:
        """Whether this source may be fetched at all.

        False for every portal, always. False for anything whose licence nobody
        has read — not as a technical limitation, but because the corpus policy
        says an unverified licence means no ingestion.
        """
        if self.access_mode is RecordAccessMode.PORTAL_LINK_ONLY:
            return False
        return bool(self.licence) and bool(self.source_url)


@dataclass(frozen=True)
class StoredRecord:
    record: Record
    #: The source row exactly as it arrived, before any field mapping.
    raw: dict
    #: Hash of the raw row. Two ingests of an unchanged row produce the same
    #: hash, which is what makes an incremental append idempotent.
    source_row_hash: str
    snapshot_id: str = ""

    @property
    def record_id(self) -> str:
        return self.record.record_id


@dataclass(frozen=True)
class Snapshot:
    """One ingest of one source. Append-only; a row here is never updated."""

    snapshot_id: str
    source_id: str
    taken_at: datetime
    rows_added: int = 0
    rows_changed: int = 0
    rows_removed: int = 0
    rows_total: int = 0
    checksum: str = ""
    note: str = ""


@dataclass(frozen=True)
class AggregateStatistic:
    """A count, in its own table, that can never attach to a specific product.

    Aggregates answer "how many applications of this kind were filed in this
    period". They are charts. Attaching one to a claim about a reader's own
    formulation would be arithmetic pretending to be evidence, so they live
    apart from `records` and nothing in the answer path can read them.
    """

    source_id: str
    dimension: str
    period: str
    measure: str
    value: float
    citable_in_answers: bool = False
    as_of: date | None = None
