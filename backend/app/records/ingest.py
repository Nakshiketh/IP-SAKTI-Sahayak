"""Loading records from a bulk source. Config-driven, snapshot-based, gated.

**There is no fetcher for a portal.** `ingest_source` refuses on `access_mode`
before it looks at anything else, and there is no argument, flag or override
past that refusal. Those services are interactive and session-based, their terms
generally prohibit automated retrieval, and the product links out rather than
claiming to have run the search. A test greps the repository for a file that
names a portal source next to fetch code.

**A source with no licence is not ingested.** Not because the code cannot, but
because the corpus policy says so: open government data typically requires
verbatim attribution and prohibits implying endorsement, and a licence nobody
has read is a licence nobody has complied with. If a licence is unclear, the
source is treated as portal-only.

Three gates fail a run rather than degrade it:

* an empty licence,
* schema drift — a column the field map names is not in the file,
* a mapped field null in more than 5% of rows, which means the mapping is wrong
  even though every row parsed.

The third is the interesting one. A mapping that silently produces nulls is
worse than one that crashes: the rows load, the counts look right, and every
record is missing its filing date.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from pathlib import Path

from app.models.domain import Jurisdiction, Record, RecordType
from app.records.store import RecordsStore
from app.records.types import (
    AggregateStatistic,
    RecordAccessMode,
    RecordSource,
    Snapshot,
    StoredRecord,
)

#: Above this share of nulls in a mapped field, the mapping is wrong.
MAX_NULL_SHARE = 0.05

#: Fields a mapping must fill for a record to be worth storing. A record with no
#: id cannot be deduplicated and one with no title cannot be shown.
REQUIRED_FIELDS = ("record_id", "title")


@dataclass
class SourceOutcome:
    source_id: str
    outcome: str
    reason: str = ""
    rows_added: int = 0
    rows_changed: int = 0
    rows_removed: int = 0
    rows_total: int = 0
    snapshot_id: str = ""

    @property
    def ok(self) -> bool:
        return self.outcome == "ok"


@dataclass
class RecordsReport:
    outcomes: list[SourceOutcome] = field(default_factory=list)
    records_written: int = 0
    aggregates_written: int = 0

    def add(self, outcome: SourceOutcome) -> SourceOutcome:
        self.outcomes.append(outcome)
        return outcome

    def failures(self) -> list[SourceOutcome]:
        return [o for o in self.outcomes if o.outcome == "failed"]

    def skips(self) -> list[SourceOutcome]:
        return [o for o in self.outcomes if o.outcome == "skipped"]

    @property
    def failed(self) -> bool:
        return bool(self.failures())


class PortalSourceRefused(Exception):
    """Raised if anything ever asks this module to fetch a portal."""


def row_hash(row: dict) -> str:
    return hashlib.sha256(
        json.dumps(row, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    text = value.strip()
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=UTC).date()
        except ValueError:
            continue
    return None


def read_rows(path: Path, parser: str) -> list[dict]:
    """Read a bulk file into rows. CSV and JSON lines; nothing exotic."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if parser == "csv":
        return [dict(row) for row in csv.DictReader(io.StringIO(text))]
    if parser == "jsonl":
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    if parser == "json":
        loaded = json.loads(text)
        return list(loaded) if isinstance(loaded, list) else list(loaded.get("records", []))
    raise ValueError("unknown records parser: " + parser)


def check_schema(rows: list[dict], field_map: dict[str, str | None]) -> list[str]:
    """Columns the field map names that the file does not have."""
    if not rows:
        return []
    present = set(rows[0])
    return sorted({column for column in field_map.values() if column and column not in present})


def map_rows(
    rows: list[dict], source: RecordSource, *, taken_at: datetime
) -> tuple[list[StoredRecord], dict[str, float]]:
    """Apply the field map, and report how often each mapped field came out null."""
    mapped: list[StoredRecord] = []
    nulls: dict[str, int] = {name: 0 for name in source.field_map}

    for row in rows:
        values = {
            name: (str(row.get(column, "")).strip() or None) if column else None
            for name, column in source.field_map.items()
        }
        for name, value in values.items():
            if value is None:
                nulls[name] += 1
        if any(values.get(name) is None for name in REQUIRED_FIELDS):
            continue

        record = Record(
            record_id=source.source_id + "-" + str(values["record_id"]),
            source_id=source.source_id,
            jurisdiction=Jurisdiction(source.jurisdiction),
            record_type=RecordType(source.record_type),
            title=str(values["title"]),
            applicant=values.get("applicant"),
            inventor_or_proprietor=values.get("inventor_or_proprietor"),
            filing_date=_parse_date(values.get("filing_date")),
            publication_date=_parse_date(values.get("publication_date")),
            grant_or_registration_date=_parse_date(values.get("grant_or_registration_date")),
            status=values.get("status"),
            goods_or_field=values.get("goods_or_field"),
            abstract_text=values.get("abstract_text"),
            snapshot_at=taken_at,
        )
        mapped.append(StoredRecord(record=record, raw=row, source_row_hash=row_hash(row)))

    total = len(rows) or 1
    return mapped, {name: count / total for name, count in nulls.items()}


def ingest_source(
    source: RecordSource,
    store: RecordsStore,
    *,
    data_dir: Path,
    taken_at: datetime | None = None,
) -> SourceOutcome:
    """Load one source. Refuses a portal before anything else happens."""
    if source.access_mode is RecordAccessMode.PORTAL_LINK_ONLY:
        # Not a configuration question, and not a code path with a flag on it.
        return SourceOutcome(
            source.source_id,
            "skipped",
            "portal_link_only: this product links out and never runs the search",
        )

    if not source.licence:
        return SourceOutcome(
            source.source_id,
            "skipped",
            "no licence has been read for this source, so it is not ingested",
        )

    if not source.source_url:
        return SourceOutcome(
            source.source_id, "skipped", "no source_url has been verified for this source"
        )

    if not source.parser or not source.field_map:
        return SourceOutcome(
            source.source_id, "failed", "a bulk source needs a parser and a field map"
        )

    path = data_dir / source.source_url
    if not path.exists():
        path = Path(source.source_url)
    if not path.exists():
        return SourceOutcome(
            source.source_id, "failed", "the file named by source_url is not there: " + str(path)
        )

    when = taken_at or datetime.now(UTC)
    try:
        rows = read_rows(path, source.parser)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return SourceOutcome(source.source_id, "failed", "could not be read: " + str(error))

    if not rows:
        return SourceOutcome(source.source_id, "failed", "the file held no rows")

    drift = check_schema(rows, source.field_map)
    if drift:
        return SourceOutcome(
            source.source_id,
            "failed",
            "schema drift: the field map names columns the file does not have: " + ", ".join(drift),
        )

    mapped, null_shares = map_rows(rows, source, taken_at=when)
    over = {
        name: share
        for name, share in null_shares.items()
        if source.field_map.get(name) and share > MAX_NULL_SHARE
    }
    if over:
        worst = ", ".join(
            name + " (" + str(round(share * 100)) + "% null)"
            for name, share in sorted(over.items())
        )
        return SourceOutcome(
            source.source_id,
            "failed",
            "a mapped field is null in more than "
            + str(round(MAX_NULL_SHARE * 100))
            + "% of rows, so the mapping is wrong: "
            + worst,
        )

    if not mapped:
        return SourceOutcome(source.source_id, "failed", "no row had both a record id and a title")

    # Diff against the last state of this source. Idempotent on the row hash, so
    # re-running over an unchanged file writes a snapshot that reports no change
    # rather than rewriting every row as new.
    previous = store.latest_rows(source.source_id)
    added = changed = 0
    for item in mapped:
        before = previous.get(item.record_id)
        if before is None:
            added += 1
        elif before != item.source_row_hash:
            changed += 1
    removed = sorted(set(previous) - {item.record_id for item in mapped})

    snapshot_id = uuid.uuid4().hex
    store.upsert_source(source)
    store.write_records(
        [
            StoredRecord(
                record=item.record,
                raw=item.raw,
                source_row_hash=item.source_row_hash,
                snapshot_id=snapshot_id,
            )
            for item in mapped
        ]
    )
    store.remove_records(removed)
    store.record_snapshot(
        Snapshot(
            snapshot_id=snapshot_id,
            source_id=source.source_id,
            taken_at=when,
            rows_added=added,
            rows_changed=changed,
            rows_removed=len(removed),
            rows_total=len(mapped),
            checksum=row_hash({"rows": sorted(item.source_row_hash for item in mapped)}),
        )
    )

    return SourceOutcome(
        source.source_id,
        "ok",
        str(len(mapped)) + " records",
        rows_added=added,
        rows_changed=changed,
        rows_removed=len(removed),
        rows_total=len(mapped),
        snapshot_id=snapshot_id,
    )


def ingest_aggregates(
    source: RecordSource, store: RecordsStore, *, data_dir: Path
) -> SourceOutcome:
    """Load counts into their own table. Charts only, never attached to a claim."""
    if source.access_mode is RecordAccessMode.PORTAL_LINK_ONLY:
        return SourceOutcome(source.source_id, "skipped", "portal_link_only")
    if not source.licence or not source.source_url:
        return SourceOutcome(
            source.source_id, "skipped", "no licence or no verified URL for this source"
        )

    path = data_dir / source.source_url
    if not path.exists():
        return SourceOutcome(
            source.source_id, "failed", "the file named by source_url is not there"
        )

    rows = read_rows(path, source.parser or "csv")
    statistics = [
        AggregateStatistic(
            source_id=source.source_id,
            dimension=str(row.get("dimension", "")),
            period=str(row.get("period", "")),
            measure=str(row.get("measure", "")),
            value=float(row.get("value", 0) or 0),
        )
        for row in rows
        if row.get("dimension") and row.get("period")
    ]
    if not statistics:
        return SourceOutcome(source.source_id, "failed", "no aggregate rows could be read")

    store.upsert_source(source)
    store.write_aggregates(statistics)
    return SourceOutcome(
        source.source_id, "ok", str(len(statistics)) + " aggregate rows", rows_total=len(statistics)
    )
