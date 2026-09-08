"""An append-only record of what the system did.

What is written: the session id, the jurisdiction, the passage ids retrieved,
which model and prompt version ran, the corpus version, latency, the confidence
reached and whether it abstained, how many instruction-like spans were stripped
from retrieved text, and consent events.

What is not written, ever: the question text, the answer text, any user
identity, and any IP address. The audit answers "did this system behave the way
it says it does" — which passages, which version, which decision — and none of
those questions need the reader's words. A store that held the questions would
be a store of what people are worried about in their own businesses, which is
exactly the kind of thing that should not exist by default. `question_hash` is
kept so the same question asked twice can be recognised as the same question,
without the question being recoverable from the row.

Append-only is enforced by the interface: there is `record` and there is
`read_recent`, and nothing that updates or deletes.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at       TEXT NOT NULL,
    event             TEXT NOT NULL,
    session_id        TEXT NOT NULL,
    query_id          TEXT,
    question_hash     TEXT,
    jurisdiction      TEXT,
    language_in       TEXT,
    language_out      TEXT,
    passage_ids       TEXT NOT NULL DEFAULT '[]',
    model             TEXT,
    prompt_version    TEXT,
    corpus_version    TEXT,
    translator        TEXT,
    confidence        TEXT,
    abstained         INTEGER,
    abstain_reason    TEXT,
    refusal_kind      TEXT,
    neutralised_spans INTEGER NOT NULL DEFAULT 0,
    dropped_claims    INTEGER NOT NULL DEFAULT 0,
    latency_ms        INTEGER,
    detail            TEXT
);
CREATE INDEX IF NOT EXISTS audit_session ON audit(session_id);
CREATE INDEX IF NOT EXISTS audit_recorded_at ON audit(recorded_at);
"""


def hash_question(question: str) -> str:
    """A stable, non-reversible fingerprint of the question.

    Not salted, deliberately: an unsalted digest lets two rows be recognised as
    the same question, which is the only thing this field is for. It is a
    fingerprint of a short natural-language string and is not treated as a
    secret anywhere.
    """
    return hashlib.sha256(question.strip().casefold().encode("utf-8")).hexdigest()[:32]


@dataclass
class AuditRow:
    event: str
    session_id: str
    query_id: str | None = None
    question_hash: str | None = None
    jurisdiction: str | None = None
    language_in: str | None = None
    language_out: str | None = None
    passage_ids: list[str] = field(default_factory=list)
    model: str | None = None
    prompt_version: str | None = None
    corpus_version: str | None = None
    translator: str | None = None
    confidence: str | None = None
    abstained: bool | None = None
    abstain_reason: str | None = None
    refusal_kind: str | None = None
    neutralised_spans: int = 0
    dropped_claims: int = 0
    latency_ms: int | None = None
    detail: dict | None = None


class AuditLog:
    def __init__(self, path: Path, *, enabled: bool = True) -> None:
        self._path = path
        self._enabled = enabled
        self._ready = False

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        if not self._ready:
            connection.executescript(SCHEMA)
            connection.commit()
            self._ready = True
        return connection

    def record(self, row: AuditRow) -> None:
        if not self._enabled:
            return
        data = asdict(row)
        data["passage_ids"] = json.dumps(row.passage_ids)
        data["detail"] = json.dumps(row.detail) if row.detail is not None else None
        data["abstained"] = None if row.abstained is None else int(row.abstained)
        data["recorded_at"] = datetime.now(UTC).isoformat()

        columns = ", ".join(data)
        placeholders = ", ".join(":" + name for name in data)
        connection = self._connect()
        try:
            connection.execute(
                "INSERT INTO audit (" + columns + ") VALUES (" + placeholders + ")", data
            )
            connection.commit()
        finally:
            connection.close()

    def read_recent(self, limit: int = 50) -> list[dict]:
        if not self._enabled or not self._path.exists():
            return []
        connection = self._connect()
        try:
            rows = connection.execute(
                "SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        finally:
            connection.close()
        return [dict(row) for row in rows]
