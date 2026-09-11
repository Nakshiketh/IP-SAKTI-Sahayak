"""Conversations, messages and analysis history, per account.

Its own SQLite file beside the accounts database. The audit log is untouched: it
still holds no question text and no identity. This store holds an inventor's own
words on purpose — so they can come back to an analysis — and it is keyed by
account, readable only through that account, and deletable from the interface.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL,
    title       TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL,
    invention   TEXT NOT NULL,
    state       TEXT NOT NULL,
    analysis    TEXT
);
CREATE INDEX IF NOT EXISTS conversations_user ON conversations(username, updated_at);
CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role            TEXT NOT NULL,
    text            TEXT NOT NULL,
    meta            TEXT NOT NULL,
    created_at      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS analysis_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    created_at      REAL NOT NULL,
    trigger         TEXT NOT NULL,
    indicator       TEXT NOT NULL,
    product_matches INTEGER NOT NULL,
    patent_matches  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_conversation ON analysis_runs(conversation_id, id);
"""


class AnalystStore:
    def __init__(self, path: Path) -> None:
        self._path = path

    def _connect(self) -> sqlite3.Connection:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._path)
        connection.row_factory = sqlite3.Row
        connection.executescript(SCHEMA)
        return connection

    def create(self, username: str, invention: dict, state: dict) -> str:
        conversation_id = uuid.uuid4().hex
        now = time.time()
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO conversations (id, username, title, created_at, updated_at, invention, state, analysis)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                (
                    conversation_id,
                    username,
                    "New invention",
                    now,
                    now,
                    json.dumps(invention),
                    json.dumps(state),
                ),
            )
        return conversation_id

    def load(self, username: str, conversation_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM conversations WHERE id = ? AND username = ?",
                (conversation_id, username),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "invention": json.loads(row["invention"]),
            "state": json.loads(row["state"]),
            "analysis": json.loads(row["analysis"]) if row["analysis"] else None,
        }

    def save(
        self,
        conversation_id: str,
        *,
        title: str,
        invention: dict,
        state: dict,
        analysis: dict | None,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE conversations SET title = ?, updated_at = ?, invention = ?, state = ?, analysis = ? WHERE id = ?",
                (
                    title,
                    time.time(),
                    json.dumps(invention),
                    json.dumps(state),
                    json.dumps(analysis) if analysis is not None else None,
                    conversation_id,
                ),
            )

    def list(self, username: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, title, created_at, updated_at, invention, analysis FROM conversations"
                " WHERE username = ? ORDER BY updated_at DESC LIMIT 50",
                (username,),
            ).fetchall()
        out = []
        for row in rows:
            analysis = json.loads(row["analysis"]) if row["analysis"] else None
            out.append(
                {
                    "id": row["id"],
                    "title": row["title"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "indicator": analysis["assessment"]["indicator"] if analysis else None,
                    "ingredient_count": len(json.loads(row["invention"]).get("ingredients", [])),
                }
            )
        return out

    def delete(self, username: str, conversation_id: str) -> bool:
        with self._connect() as connection:
            deleted = connection.execute(
                "DELETE FROM conversations WHERE id = ? AND username = ?",
                (conversation_id, username),
            ).rowcount
            if deleted:
                connection.execute(
                    "DELETE FROM messages WHERE conversation_id = ?", (conversation_id,)
                )
                connection.execute(
                    "DELETE FROM analysis_runs WHERE conversation_id = ?", (conversation_id,)
                )
        return bool(deleted)

    def add_message(
        self, conversation_id: str, role: str, text: str, meta: dict | None = None
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO messages (conversation_id, role, text, meta, created_at) VALUES (?, ?, ?, ?, ?)",
                (conversation_id, role, text, json.dumps(meta or {}), time.time()),
            )

    def messages(self, conversation_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY id", (conversation_id,)
            ).fetchall()
        return [
            {
                "id": r["id"],
                "role": r["role"],
                "text": r["text"],
                "meta": json.loads(r["meta"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def add_run(
        self, conversation_id: str, *, trigger: str, indicator: str, products: int, patents: int
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO analysis_runs (conversation_id, created_at, trigger, indicator, product_matches, patent_matches)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (conversation_id, time.time(), trigger, indicator, products, patents),
            )

    def runs(self, conversation_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM analysis_runs WHERE conversation_id = ? ORDER BY id DESC LIMIT 20",
                (conversation_id,),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "trigger": r["trigger"],
                "indicator": r["indicator"],
                "product_matches": r["product_matches"],
                "patent_matches": r["patent_matches"],
            }
            for r in rows
        ]
