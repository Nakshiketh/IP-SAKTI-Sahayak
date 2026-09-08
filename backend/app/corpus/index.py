"""Writing the index retrieval reads.

One SQLite file per jurisdiction — `chunks-in.sqlite3`, `chunks-intl.sqlite3` —
because that is what makes rule 2 structural. `app.retrieval.store.Namespaces`
opens one of them per query and there is no filter to forget. Two namespaces in
one file with a jurisdiction column would work exactly until somebody wrote a
query that omitted the column.

Each row is the chunk as JSON, in the shape `chunk_from_mapping` reads. Storing
the payload rather than a column per field is a deliberate trade: the index is
written whole by this module and read whole by that one, nothing queries it by
field, and a schema migration for every new chunk attribute would be pure cost.
The `meta` table carries what the index as a whole is — its version, when it was
built, which embedder ran, how many documents it covers.

The write is atomic. The index is built into a temporary file and moved into
place, so a run that dies halfway leaves the previous index intact rather than a
half-written one that retrieval would happily read.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from app.corpus.types import DocumentEntry, SegmentedChunk

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
    chunk_id    TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    payload     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_document ON chunks(document_id);
"""


def index_path(index_dir: Path, jurisdiction: str) -> Path:
    return index_dir / ("chunks-" + jurisdiction.lower() + ".sqlite3")


def payload_for(chunk: SegmentedChunk, entry: DocumentEntry) -> dict:
    """The chunk as `app.retrieval.store.chunk_from_mapping` expects it.

    Document identity is written onto every chunk rather than joined at read
    time. A citation has to be renderable from a retrieval result without a
    second lookup that could fail and leave a passage cited to nothing.
    """
    return {
        "chunk_id": chunk.chunk_id,
        "section_key": chunk.section_key,
        "content_hash": chunk.content_hash,
        "document_id": chunk.document_id,
        "document_title": entry.title,
        "organization": entry.organization,
        "text": chunk.text,
        "section_path": list(chunk.section_path),
        "heading": chunk.heading,
        "page_from": chunk.page_from,
        "page_to": chunk.page_to,
        "token_count": chunk.token_count,
        "source_url": entry.source_url,
        "version_label": entry.version_label,
        "document_type": entry.document_type,
        "verification_status": entry.verification_status,
        "effective_from": chunk.effective_from.isoformat() if chunk.effective_from else None,
        "effective_to": chunk.effective_to.isoformat() if chunk.effective_to else None,
        "superseded_by": entry.superseded_by,
        "ip_rights": list(chunk.ip_rights),
        "regulatory_areas": list(chunk.regulatory_areas),
        "product_classes": list(chunk.product_classes),
        "conflicts_with": list(chunk.conflicts_with),
        "topics": list(chunk.topics),
    }


def write_index(
    path: Path,
    rows: list[tuple[SegmentedChunk, DocumentEntry]],
    *,
    corpus_version: str,
    embedder: str | None = None,
    embedding_dimension: int | None = None,
) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_suffix(".sqlite3.building")
    if staging.exists():
        staging.unlink()

    connection = sqlite3.connect(staging)
    try:
        connection.executescript(SCHEMA)
        connection.executemany(
            "INSERT OR REPLACE INTO chunks (chunk_id, document_id, payload) VALUES (?, ?, ?)",
            [
                (
                    chunk.chunk_id,
                    chunk.document_id,
                    json.dumps(payload_for(chunk, entry), ensure_ascii=False),
                )
                for chunk, entry in rows
            ],
        )
        meta = {
            "corpus_version": corpus_version,
            "built_at": datetime.now(UTC).isoformat(),
            "chunk_count": str(len(rows)),
            "document_count": str(len({chunk.document_id for chunk, _entry in rows})),
            "embedder": embedder or "none",
            "embedding_dimension": str(embedding_dimension) if embedding_dimension else "",
        }
        connection.executemany(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", list(meta.items())
        )
        connection.commit()
    finally:
        connection.close()

    # Atomic on both platforms this runs on: a run that dies before here leaves
    # the previous index untouched rather than a half-written one.
    os.replace(staging, path)
    return len(rows)


def read_index(path: Path) -> dict[str, dict]:
    """Every chunk in a built index, keyed by chunk id. Empty when absent."""
    if not path.exists():
        return {}
    connection = sqlite3.connect("file:" + str(path) + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute("SELECT chunk_id, payload FROM chunks").fetchall()
    finally:
        connection.close()
    return {row["chunk_id"]: json.loads(row["payload"]) for row in rows}


def read_meta(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    connection = sqlite3.connect("file:" + str(path) + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        rows = connection.execute("SELECT key, value FROM meta").fetchall()
    finally:
        connection.close()
    return {row["key"]: row["value"] for row in rows}
