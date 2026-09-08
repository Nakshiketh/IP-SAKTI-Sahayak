"""The source set, served from the manifest.

`corpus/manifest.json` is the single source of truth for what the product
intends to cover, and it is the same file the frontend reads directly today.
Serving it here as well is not duplication: the manifest says what is *planned*,
and this endpoint can say, per document, how many passages are actually indexed
for it — a fact only the running index knows.

A document with no passages indexed is reported with a count of zero rather than
omitted. "Planned but not fetched" is the honest state of most of this corpus
until Phase 11, and hiding those entries would make the source set look complete.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query

from app.api.deps import get_namespaces
from app.core.errors import ApiError
from app.core.settings import get_settings
from app.models.api import SourceDetail, SourcesResult, SourceSummary
from app.models.domain import Document, Jurisdiction

router = APIRouter(prefix="/api/v1", tags=["sources"])


@lru_cache
def _manifest(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _load() -> dict:
    settings = get_settings()
    path = settings.corpus_dir / "manifest.json"
    if not path.exists():
        raise ApiError("manifest_missing", "corpus/manifest.json is not present.", 500)
    return _manifest(str(path))


def _summary(entry: dict) -> SourceSummary:
    return SourceSummary(
        document_id=entry["document_id"],
        title=entry["title"],
        short_title=entry.get("short_title"),
        organization=entry["organization"],
        jurisdiction=Jurisdiction(entry["jurisdiction"]),
        regime_family=entry["regime_family"],
        document_type=entry["document_type"],
        group=entry["group"],
        source_url=entry.get("source_url"),
        effective_from=entry.get("effective_from"),
        retrieved_at=entry.get("retrieved_at"),
        verification_status=entry.get("verification_status", "unverified"),
    )


@router.get("/sources", response_model=SourcesResult, response_model_by_alias=True)
def list_sources(
    jurisdiction: Jurisdiction | None = None,
    group: str | None = None,
    document_type: str | None = None,
    verification_status: str | None = None,
    q: str | None = Query(default=None, description="Match on title or organization"),
) -> SourcesResult:
    manifest = _load()
    entries = list(manifest["documents"])

    if jurisdiction is not None:
        entries = [e for e in entries if e["jurisdiction"] == jurisdiction.value]
    if group is not None:
        entries = [e for e in entries if e["group"] == group]
    if document_type is not None:
        entries = [e for e in entries if e["document_type"] == document_type]
    if verification_status is not None:
        entries = [e for e in entries if e.get("verification_status") == verification_status]
    if q:
        needle = q.casefold()
        entries = [
            e
            for e in entries
            if needle in e["title"].casefold() or needle in e["organization"].casefold()
        ]

    return SourcesResult(
        corpus_version=manifest["corpus_version"],
        group_order=list(manifest["group_order"]),
        documents=[_summary(entry) for entry in entries],
        fetched_count=sum(1 for entry in entries if entry.get("retrieved_at")),
    )


@router.get("/sources/{document_id}", response_model=SourceDetail, response_model_by_alias=True)
def get_source(document_id: str) -> SourceDetail:
    manifest = _load()
    entry = next(
        (e for e in manifest["documents"] if e["document_id"] == document_id),
        None,
    )
    if entry is None:
        raise ApiError("unknown_document", "No such document: " + document_id, 404)

    jurisdiction = Jurisdiction(entry["jurisdiction"])
    store = get_namespaces().store(jurisdiction)
    chunk_count = sum(1 for chunk in store.chunks() if chunk.document_id == document_id)

    known = set(Document.model_fields)
    return SourceDetail(
        document=Document(**{key: value for key, value in entry.items() if key in known}),
        chunk_count=chunk_count,
    )
