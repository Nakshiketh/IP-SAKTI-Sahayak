"""The records database. SQLite in development, Postgres-ready in shape.

Five tables, and what is absent from them is as deliberate as what is present:

    record_sources        one row per source, with its licence and attribution
    records               one row per filed or granted thing, plus its raw row
    record_snapshots      append-only; one row per ingest
    aggregate_statistics  counts, in their own table, for charts only
    records_fts           full-text over title, abstract and applicant

There is **no embedding column and no vector table**. Records are tabular, far
larger than the corpus and semantically thin; embedding them would pollute
retrieval and produce citations that look authoritative and are not law. The
absence is the design, and a test asserts the schema has no such column.

Full-text search is SQLite's FTS5 over three fields. It is a lookup — "has
anybody filed something like this" — not a retrieval that feeds an answer. The
service above it never returns records to the generator.

Snapshots are append-only. `record_snapshots` has no update path, and a record
that changes gets a new row keyed by the snapshot that produced it, so what a
previous snapshot said stays readable.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, date, datetime
from pathlib import Path

from app.models.domain import Jurisdiction, Record, RecordType
from app.records.types import AggregateStatistic, RecordSource, Snapshot, StoredRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS record_sources (
    source_id        TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    publisher        TEXT NOT NULL,
    jurisdiction     TEXT NOT NULL,
    record_type      TEXT NOT NULL,
    access_mode      TEXT NOT NULL,
    licence          TEXT,
    licence_url      TEXT,
    attribution_text TEXT,
    source_url       TEXT,
    update_cadence   TEXT,
    last_snapshot_at TEXT,
    snapshot_checksum TEXT,
    record_count     INTEGER,
    terms_note       TEXT,
    link_template    TEXT
);

CREATE TABLE IF NOT EXISTS record_snapshots (
    snapshot_id   TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL,
    taken_at      TEXT NOT NULL,
    rows_added    INTEGER NOT NULL DEFAULT 0,
    rows_changed  INTEGER NOT NULL DEFAULT 0,
    rows_removed  INTEGER NOT NULL DEFAULT 0,
    rows_total    INTEGER NOT NULL DEFAULT 0,
    checksum      TEXT NOT NULL DEFAULT '',
    note          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS snapshots_source ON record_snapshots(source_id, taken_at);

CREATE TABLE IF NOT EXISTS records (
    record_id       TEXT PRIMARY KEY,
    source_id       TEXT NOT NULL,
    snapshot_id     TEXT NOT NULL,
    jurisdiction    TEXT NOT NULL,
    record_type     TEXT NOT NULL,
    title           TEXT NOT NULL,
    applicant       TEXT,
    filing_date     TEXT,
    publication_date TEXT,
    grant_or_registration_date TEXT,
    status          TEXT,
    goods_or_field  TEXT,
    abstract_text   TEXT,
    snapshot_at     TEXT,
    source_row_hash TEXT NOT NULL,
    payload         TEXT NOT NULL,
    raw             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_source ON records(source_id);
CREATE INDEX IF NOT EXISTS records_type ON records(record_type, jurisdiction);
CREATE INDEX IF NOT EXISTS records_filing ON records(filing_date);

CREATE TABLE IF NOT EXISTS aggregate_statistics (
    source_id TEXT NOT NULL,
    dimension TEXT NOT NULL,
    period    TEXT NOT NULL,
    measure   TEXT NOT NULL,
    value     REAL NOT NULL,
    as_of     TEXT,
    PRIMARY KEY (source_id, dimension, period, measure)
);

CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
    title, abstract_text, applicant, record_id UNINDEXED, tokenize='unicode61'
);
"""


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def _as_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def _as_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def record_from_row(row: sqlite3.Row) -> Record:
    payload = json.loads(row["payload"])
    return Record(
        record_id=payload["record_id"],
        source_id=payload["source_id"],
        jurisdiction=Jurisdiction(payload["jurisdiction"]),
        record_type=RecordType(payload["record_type"]),
        title=payload["title"],
        applicant=payload.get("applicant"),
        inventor_or_proprietor=payload.get("inventor_or_proprietor"),
        filing_date=_as_date(payload.get("filing_date")),
        publication_date=_as_date(payload.get("publication_date")),
        grant_or_registration_date=_as_date(payload.get("grant_or_registration_date")),
        status=payload.get("status"),
        classification_codes=list(payload.get("classification_codes") or []),
        goods_or_field=payload.get("goods_or_field"),
        abstract_text=payload.get("abstract_text"),
        snapshot_at=_as_datetime(payload.get("snapshot_at")),
    )


def record_payload(record: Record) -> dict:
    return {
        "record_id": record.record_id,
        "source_id": record.source_id,
        "jurisdiction": record.jurisdiction.value,
        "record_type": record.record_type.value,
        "title": record.title,
        "applicant": record.applicant,
        "inventor_or_proprietor": record.inventor_or_proprietor,
        "filing_date": _iso(record.filing_date),
        "publication_date": _iso(record.publication_date),
        "grant_or_registration_date": _iso(record.grant_or_registration_date),
        "status": record.status,
        "classification_codes": list(record.classification_codes),
        "goods_or_field": record.goods_or_field,
        "abstract_text": record.abstract_text,
        "snapshot_at": _iso(record.snapshot_at),
    }


class RecordsStore:
    """The records database, opened lazily and created on first write."""

    def __init__(self, path: Path) -> None:
        self._path = path

    @property
    def path(self) -> Path:
        return self._path

    @property
    def available(self) -> bool:
        return self._path.exists()

    def _connect(self, *, write: bool = False) -> sqlite3.Connection:
        if write:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            connection = sqlite3.connect(self._path)
            connection.executescript(SCHEMA)
        else:
            if not self._path.exists():
                raise FileNotFoundError(str(self._path))
            connection = sqlite3.connect("file:" + str(self._path) + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        return connection

    def initialise(self) -> None:
        self._connect(write=True).close()

    # -- sources -----------------------------------------------------------

    def upsert_source(self, source: RecordSource) -> None:
        connection = self._connect(write=True)
        try:
            connection.execute(
                """
                INSERT OR REPLACE INTO record_sources (
                    source_id, name, publisher, jurisdiction, record_type, access_mode,
                    licence, licence_url, attribution_text, source_url, update_cadence,
                    last_snapshot_at, snapshot_checksum, record_count, terms_note, link_template
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    source.source_id,
                    source.name,
                    source.publisher,
                    source.jurisdiction,
                    source.record_type,
                    source.access_mode.value,
                    source.licence,
                    source.licence_url,
                    source.attribution_text,
                    source.source_url,
                    source.update_cadence,
                    _iso(source.last_snapshot_at),
                    source.snapshot_checksum,
                    source.record_count,
                    source.terms_note,
                    source.link_template,
                ),
            )
            connection.commit()
        finally:
            connection.close()

    def sources(self) -> list[dict]:
        if not self.available:
            return []
        connection = self._connect()
        try:
            rows = connection.execute(
                "SELECT * FROM record_sources ORDER BY jurisdiction, name"
            ).fetchall()
        finally:
            connection.close()
        return [dict(row) for row in rows]

    # -- snapshots ---------------------------------------------------------

    def record_snapshot(self, snapshot: Snapshot) -> None:
        """Append one snapshot row. There is no update path, by design."""
        connection = self._connect(write=True)
        try:
            connection.execute(
                """
                INSERT INTO record_snapshots (
                    snapshot_id, source_id, taken_at, rows_added, rows_changed,
                    rows_removed, rows_total, checksum, note
                ) VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (
                    snapshot.snapshot_id,
                    snapshot.source_id,
                    _iso(snapshot.taken_at),
                    snapshot.rows_added,
                    snapshot.rows_changed,
                    snapshot.rows_removed,
                    snapshot.rows_total,
                    snapshot.checksum,
                    snapshot.note,
                ),
            )
            connection.commit()
        finally:
            connection.close()

    def snapshots(self, source_id: str | None = None) -> list[Snapshot]:
        if not self.available:
            return []
        connection = self._connect()
        try:
            if source_id:
                rows = connection.execute(
                    "SELECT * FROM record_snapshots WHERE source_id = ? ORDER BY taken_at DESC",
                    (source_id,),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM record_snapshots ORDER BY taken_at DESC"
                ).fetchall()
        finally:
            connection.close()
        return [
            Snapshot(
                snapshot_id=row["snapshot_id"],
                source_id=row["source_id"],
                taken_at=_as_datetime(row["taken_at"]) or datetime.now(UTC),
                rows_added=row["rows_added"],
                rows_changed=row["rows_changed"],
                rows_removed=row["rows_removed"],
                rows_total=row["rows_total"],
                checksum=row["checksum"],
                note=row["note"],
            )
            for row in rows
        ]

    def latest_rows(self, source_id: str) -> dict[str, str]:
        """Record id to source-row hash, for the last state of this source."""
        if not self.available:
            return {}
        connection = self._connect()
        try:
            rows = connection.execute(
                "SELECT record_id, source_row_hash FROM records WHERE source_id = ?",
                (source_id,),
            ).fetchall()
        finally:
            connection.close()
        return {row["record_id"]: row["source_row_hash"] for row in rows}

    # -- records -----------------------------------------------------------

    def write_records(self, stored: list[StoredRecord]) -> int:
        connection = self._connect(write=True)
        try:
            for item in stored:
                record = item.record
                payload = record_payload(record)
                connection.execute(
                    """
                    INSERT OR REPLACE INTO records (
                        record_id, source_id, snapshot_id, jurisdiction, record_type, title,
                        applicant, filing_date, publication_date, grant_or_registration_date,
                        status, goods_or_field, abstract_text, snapshot_at, source_row_hash,
                        payload, raw
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        record.record_id,
                        record.source_id,
                        item.snapshot_id,
                        record.jurisdiction.value,
                        record.record_type.value,
                        record.title,
                        record.applicant,
                        _iso(record.filing_date),
                        _iso(record.publication_date),
                        _iso(record.grant_or_registration_date),
                        record.status,
                        record.goods_or_field,
                        record.abstract_text,
                        _iso(record.snapshot_at),
                        item.source_row_hash,
                        json.dumps(payload, ensure_ascii=False),
                        json.dumps(item.raw, ensure_ascii=False),
                    ),
                )
                connection.execute(
                    "DELETE FROM records_fts WHERE record_id = ?", (record.record_id,)
                )
                connection.execute(
                    "INSERT INTO records_fts (title, abstract_text, applicant, record_id) "
                    "VALUES (?,?,?,?)",
                    (
                        record.title,
                        record.abstract_text or "",
                        record.applicant or "",
                        record.record_id,
                    ),
                )
            connection.commit()
        finally:
            connection.close()
        return len(stored)

    def remove_records(self, record_ids: list[str]) -> int:
        if not record_ids:
            return 0
        connection = self._connect(write=True)
        try:
            connection.executemany(
                "DELETE FROM records WHERE record_id = ?", [(rid,) for rid in record_ids]
            )
            connection.executemany(
                "DELETE FROM records_fts WHERE record_id = ?", [(rid,) for rid in record_ids]
            )
            connection.commit()
        finally:
            connection.close()
        return len(record_ids)

    def get(self, record_id: str) -> Record | None:
        if not self.available:
            return None
        connection = self._connect()
        try:
            row = connection.execute(
                "SELECT * FROM records WHERE record_id = ?", (record_id,)
            ).fetchone()
        finally:
            connection.close()
        return record_from_row(row) if row else None

    def search(
        self,
        query: str = "",
        *,
        match_any: bool = False,
        record_type: str | None = None,
        jurisdiction: str | None = None,
        status: str | None = None,
        filed_from: date | None = None,
        filed_to: date | None = None,
        limit: int = 20,
    ) -> list[Record]:
        if not self.available:
            return []

        clauses: list[str] = []
        params: list[object] = []
        joined = "records"

        terms = _fts_query(query, match_any=match_any)
        if terms:
            joined = "records JOIN records_fts ON records_fts.record_id = records.record_id"
            clauses.append("records_fts MATCH ?")
            params.append(terms)
        if record_type:
            clauses.append("records.record_type = ?")
            params.append(record_type)
        if jurisdiction:
            clauses.append("records.jurisdiction = ?")
            params.append(jurisdiction)
        if status:
            clauses.append("records.status = ?")
            params.append(status)
        if filed_from:
            clauses.append("records.filing_date >= ?")
            params.append(filed_from.isoformat())
        if filed_to:
            clauses.append("records.filing_date <= ?")
            params.append(filed_to.isoformat())

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        order = "records.filing_date DESC, records.record_id"
        sql = "SELECT records.* FROM " + joined + where + " ORDER BY " + order + " LIMIT ?"
        params.append(limit)

        connection = self._connect()
        try:
            rows = connection.execute(sql, params).fetchall()
        finally:
            connection.close()
        return [record_from_row(row) for row in rows]

    def count(self, source_id: str | None = None) -> int:
        if not self.available:
            return 0
        connection = self._connect()
        try:
            if source_id:
                row = connection.execute(
                    "SELECT COUNT(*) AS n FROM records WHERE source_id = ?", (source_id,)
                ).fetchone()
            else:
                row = connection.execute("SELECT COUNT(*) AS n FROM records").fetchone()
        finally:
            connection.close()
        return int(row["n"])

    # -- aggregates --------------------------------------------------------

    def write_aggregates(self, rows: list[AggregateStatistic]) -> int:
        connection = self._connect(write=True)
        try:
            connection.executemany(
                """
                INSERT OR REPLACE INTO aggregate_statistics
                    (source_id, dimension, period, measure, value, as_of)
                VALUES (?,?,?,?,?,?)
                """,
                [
                    (
                        row.source_id,
                        row.dimension,
                        row.period,
                        row.measure,
                        row.value,
                        _iso(row.as_of),
                    )
                    for row in rows
                ],
            )
            connection.commit()
        finally:
            connection.close()
        return len(rows)

    def aggregates(
        self, *, dimension: str | None = None, period: str | None = None
    ) -> list[AggregateStatistic]:
        if not self.available:
            return []
        clauses: list[str] = []
        params: list[object] = []
        if dimension:
            clauses.append("dimension = ?")
            params.append(dimension)
        if period:
            clauses.append("period = ?")
            params.append(period)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        connection = self._connect()
        try:
            rows = connection.execute(
                "SELECT * FROM aggregate_statistics" + where + " ORDER BY period, dimension",
                params,
            ).fetchall()
        finally:
            connection.close()
        return [
            AggregateStatistic(
                source_id=row["source_id"],
                dimension=row["dimension"],
                period=row["period"],
                measure=row["measure"],
                value=row["value"],
                as_of=_as_date(row["as_of"]),
            )
            for row in rows
        ]


def _fts_query(query: str, *, match_any: bool = False) -> str:
    """Turn a typed phrase into an FTS5 query without letting its syntax through.

    Every token is quoted, so a reader typing a quote, a `NEAR` or a `*` gets a
    search for those characters rather than an operator or a syntax error.

    ``match_any`` is the difference between two genuinely different questions. A
    person using the search box means "find records with all of these words", so
    the default ANDs. Offering records *beside an answer* means "find records
    that touch any of this", and ANDing a whole sentence there matches nothing —
    no filing's title contains every word of somebody's question.
    """
    tokens = [
        token
        for token in "".join(
            character if character.isalnum() or character.isspace() else " " for character in query
        ).split()
        if len(token) > 1
    ]
    quoted = ['"' + token + '"' for token in tokens]
    return (" OR " if match_any else " ").join(quoted)
