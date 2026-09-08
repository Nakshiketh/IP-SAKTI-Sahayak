"""Reading `corpus/records-manifest.json`.

Parallel to `app.corpus.manifest`, and deliberately not shared with it. The two
manifests describe different kinds of thing and enforce different rules: a
corpus entry without an effective date is broken, a records source without a
licence is simply not ingested yet. Merging the readers would mean one set of
validations pretending to cover both.

The one rule enforced at read time is the one that cannot be allowed to depend
on anybody remembering it: a `portal_link_only` source may not carry a parser or
a field map. If it did, somebody would eventually write a fetcher against them.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.records.types import RecordAccessMode, RecordSource


def _as_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def source_from_row(row: dict) -> RecordSource:
    access_mode = RecordAccessMode(row["access_mode"])

    if access_mode is RecordAccessMode.PORTAL_LINK_ONLY and (
        row.get("parser") or row.get("field_map")
    ):
        raise ValueError(
            row["source_id"]
            + " is portal_link_only and carries a parser or field map. There must be "
            "nothing here for a fetcher to be written against."
        )

    return RecordSource(
        source_id=row["source_id"],
        name=row["name"],
        publisher=row["publisher"],
        jurisdiction=row["jurisdiction"],
        record_type=row["record_type"],
        access_mode=access_mode,
        licence=row.get("licence"),
        licence_url=row.get("licence_url"),
        attribution_text=row.get("attribution_text"),
        source_url=row.get("source_url"),
        update_cadence=row.get("update_cadence", "unknown_until_verified"),
        last_snapshot_at=_as_datetime(row.get("last_snapshot_at")),
        snapshot_checksum=row.get("snapshot_checksum"),
        record_count=row.get("record_count"),
        terms_note=row.get("terms_note", ""),
        parser=row.get("parser"),
        field_map=dict(row.get("field_map") or {}),
        link_template=row.get("link_template"),
    )


class RecordsManifest:
    def __init__(self, path: Path, raw: dict) -> None:
        self.path = path
        self.raw = raw
        self.records_version: str = raw.get("records_version", "0.0.0-unbuilt")
        self.sources: list[RecordSource] = [source_from_row(row) for row in raw.get("sources", [])]
        seen: set[str] = set()
        for source in self.sources:
            if source.source_id in seen:
                raise ValueError("duplicate source_id in records manifest: " + source.source_id)
            seen.add(source.source_id)

    @classmethod
    def load(cls, path: Path) -> RecordsManifest:
        return cls(path, json.loads(path.read_text(encoding="utf-8")))

    def by_id(self, source_id: str) -> RecordSource | None:
        return next((s for s in self.sources if s.source_id == source_id), None)

    def select(self, only: tuple[str, ...] = ()) -> list[RecordSource]:
        if not only:
            return list(self.sources)
        wanted = set(only)
        unknown = wanted - {source.source_id for source in self.sources}
        if unknown:
            raise ValueError("no such records source: " + ", ".join(sorted(unknown)))
        return [source for source in self.sources if source.source_id in wanted]

    def portals(self) -> list[RecordSource]:
        return [
            source
            for source in self.sources
            if source.access_mode is RecordAccessMode.PORTAL_LINK_ONLY
        ]

    def write_back(self, updates: dict[str, dict]) -> None:
        """Record what an ingest learned. Never a licence, never an access mode.

        A machine may write when a snapshot was taken, what it hashed to and how
        many rows it held. It may not write the licence — that is a person
        reading terms — and it may not change how a source is accessed, because
        that would let a run promote a portal into something fetchable.
        """
        writable = {"last_snapshot_at", "snapshot_checksum", "record_count"}
        for row in self.raw.get("sources", []):
            update = updates.get(row["source_id"])
            if not update:
                continue
            for key, value in update.items():
                if key in writable and value is not None:
                    row[key] = value
        self.path.write_text(
            json.dumps(self.raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
