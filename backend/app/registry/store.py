"""Where the registry lives: one SQLite table, one row per source.

SQLite rather than a JSON file because two things write here — the backfill
script and the review CLI — and a person marking a source reviewed should not
have to win a race with a re-fetch.

`registry_version` is a hash over what may be cited: the source ids, their
content hashes and their review states. It changes when a source is added,
re-fetched into different bytes, or moves between review states, and it does
not change when a note is edited. An answer carries it so a reader can ask,
later, exactly which set of sources produced it.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path

from app.core.settings import get_settings
from app.registry.models import ReviewState, SourceRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
    source_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
)
"""

#: A registry with no rows means "not built yet", and the pipeline then trusts
#: the corpus as it did before. It never means "nothing is citable", because
#: that would silently empty every answer on a machine where the backfill has
#: not been run.
EMPTY_IS_PERMISSIVE = True


class SourceRegistry:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._cache: dict[str, SourceRecord] | None = None

    # -- reading -----------------------------------------------------------

    @property
    def available(self) -> bool:
        return self._path.exists()

    def all(self) -> dict[str, SourceRecord]:
        if self._cache is None:
            self._cache = self._load()
        return self._cache

    def get(self, source_id: str) -> SourceRecord | None:
        return self.all().get(source_id)

    def usable_ids(self) -> set[str]:
        return {sid for sid, record in self.all().items() if record.usable}

    def counts_by_state(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for record in self.all().values():
            key = record.review_state.value
            counts[key] = counts.get(key, 0) + 1
        return counts

    def registry_version(self) -> str:
        """Hash over (source_id, sha256, review_state) of the citable sources."""
        rows = sorted(
            (sid, record.sha256 or "", record.review_state.value)
            for sid, record in self.all().items()
            if record.usable
        )
        if not rows:
            return "registry-empty"
        digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()
        return "registry-" + digest[:12]

    def _load(self) -> dict[str, SourceRecord]:
        if not self.available:
            return {}
        connection = sqlite3.connect("file:" + str(self._path) + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute("SELECT payload FROM sources").fetchall()
        except sqlite3.DatabaseError:
            return {}
        finally:
            connection.close()
        records = [SourceRecord.model_validate_json(row["payload"]) for row in rows]
        return {record.source_id: record for record in records}

    # -- writing -----------------------------------------------------------

    def write(self, records: Iterable[SourceRecord]) -> int:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._path)
        written = 0
        try:
            connection.execute(SCHEMA)
            for record in records:
                connection.execute(
                    "INSERT INTO sources (source_id, payload) VALUES (?, ?) "
                    "ON CONFLICT(source_id) DO UPDATE SET payload = excluded.payload",
                    (record.source_id, record.model_dump_json()),
                )
                written += 1
            connection.commit()
        finally:
            connection.close()
        self._cache = None
        return written

    def mark_reviewed(self, source_id: str, reviewed_by: str, reviewed_at) -> SourceRecord:
        record = self.get(source_id)
        if record is None:
            raise KeyError(source_id)
        if record.review_state is not ReviewState.VERIFIED_OFFICIAL:
            raise ValueError(
                f"{source_id} is {record.review_state.value}; a source is reviewed after it is "
                "fetched and hashed, not instead of it."
            )
        updated = record.model_copy(
            update={
                "review_state": ReviewState.HUMAN_REVIEWED,
                "reviewed_by": reviewed_by,
                "reviewed_at": reviewed_at,
            }
        )
        self.write([updated])
        return updated


@lru_cache
def get_registry() -> SourceRegistry:
    return SourceRegistry(get_settings().registry_db_path)
