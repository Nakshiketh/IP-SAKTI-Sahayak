"""Consent, the reader's access log, and the audit viewer.

Three endpoints that exist so the privacy page can state facts instead of
promises. Every claim that page makes about what is stored is answerable from
here: the access log shows the reader their own consent events, and the audit
viewer shows a developer the actual rows, columns and all, so "the question text
is not kept" can be checked rather than believed.

The audit viewer is a development surface and refuses to serve outside one. It
holds no identity and no question text — that is the whole design of
`app.services.audit` — but a table of what a deployment has been asked is still
not something to expose on the open internet, and a route that is only
*probably* harmless should not be reachable in production.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, Query

from app.api.deps import enforce_rate_limit, get_audit_log, session_header
from app.core.errors import ApiError
from app.core.settings import get_settings
from app.models.api import (
    AccessLogResult,
    Acknowledgement,
    AuditResult,
    AuditRowResult,
    ConsentBody,
    ConsentEventRow,
    SourceSummary,
)
from app.services.audit import SCHEMA
from app.services.consent import ConsentLedger

router = APIRouter(prefix="/api/v1", tags=["privacy"])


def _ledger() -> ConsentLedger:
    return ConsentLedger(get_audit_log())


def _credentialed() -> list[SourceSummary]:
    """Manifest entries that would need a reader's own credentials.

    Read on every call rather than cached: this list is what the consent gate is
    driven by, and a manifest edit that adds a credentialed source must take
    effect without a restart. It is a handful of dictionary lookups over a file
    already on disk.
    """
    settings = get_settings()
    path: Path = settings.corpus_dir / "manifest.json"
    if not path.exists():
        return []
    manifest = json.loads(path.read_text(encoding="utf-8"))
    return [
        SourceSummary(
            document_id=row["document_id"],
            title=row["title"],
            short_title=row.get("short_title"),
            organization=row["organization"],
            jurisdiction=row["jurisdiction"],
            regime_family=row["regime_family"],
            document_type=row["document_type"],
            group=row["group"],
            source_url=row.get("source_url"),
            effective_from=row.get("effective_from"),
            retrieved_at=row.get("retrieved_at"),
            verification_status=row.get("verification_status", "unverified"),
        )
        for row in manifest.get("documents", [])
        if row.get("access_mode") == "user_credentialed"
    ]


def _name_of(source_id: str) -> str | None:
    for source in _credentialed():
        if source.document_id == source_id:
            return source.short_title or source.title
    return None


@router.post("/consent", response_model=Acknowledgement)
def consent(body: ConsentBody, session_id: str = Depends(session_header)) -> Acknowledgement:
    """Record a decision about one named source.

    An unknown source id is refused rather than logged. A consent row naming a
    source that does not exist would sit in the reader's access log looking like
    an agreement they made, and there is nothing it could be an agreement to.
    """
    session = body.session_id if body.session_id != "anonymous" else session_id
    enforce_rate_limit(session)

    name = _name_of(body.source_id)
    if name is None:
        raise ApiError(
            "unknown_source",
            "No source in the manifest with that id needs your own credentials, "
            "so there is nothing here to agree to.",
            404,
        )

    _ledger().record(
        session_id=session,
        source_id=body.source_id,
        source_name=name,
        granted=body.granted,
    )
    if body.granted:
        note = (
            name + " may now be reached with your own credentials, for this "
            "session only, until you withdraw it."
        )
    else:
        note = (
            name + " will not be reached with your credentials again. The "
            "earlier grant stays in your access log, because it happened."
        )
    return Acknowledgement(recorded=True, note=note)


@router.get("/access-log", response_model=AccessLogResult)
def access_log(session_id: str = Depends(session_header)) -> AccessLogResult:
    """This session's consent history, newest first.

    Also returns the sources that would need consent at all, so the privacy page
    can say "no source in this set needs your credentials" from the manifest
    rather than from a sentence somebody typed and forgot to update.
    """
    ledger = _ledger()
    events = ledger.events_for(session_id)
    return AccessLogResult(
        events=[
            ConsentEventRow(
                source_id=event.source_id,
                source_name=event.source_name,
                granted=event.granted,
                recorded_at=event.recorded_at,
            )
            for event in events
        ],
        granted=sorted(ledger.granted_source_ids(session_id)),
        credentialed_sources=_credentialed(),
    )


@router.get("/audit", response_model=AuditResult)
def audit(limit: int = Query(default=100, ge=1, le=500)) -> AuditResult:
    """The raw audit table. Development only.

    Every session's rows, not just the caller's: the point of this view is to
    check that the store holds what it claims to hold, and a view filtered to
    one session could not show that the others look the same.
    """
    settings = get_settings()
    if settings.environment != "development":
        raise ApiError(
            "not_available",
            "The audit viewer is a development surface and is not served here.",
            404,
        )

    rows = get_audit_log().read_recent(limit=limit)
    return AuditResult(
        rows=[
            AuditRowResult(
                id=row["id"],
                recorded_at=row["recorded_at"],
                event=row["event"],
                session_id=row["session_id"],
                query_id=row["query_id"],
                question_hash=row["question_hash"],
                jurisdiction=row["jurisdiction"],
                passage_ids=_json_list(row["passage_ids"]),
                model=row["model"],
                prompt_version=row["prompt_version"],
                corpus_version=row["corpus_version"],
                confidence=row["confidence"],
                abstained=None if row["abstained"] is None else bool(row["abstained"]),
                abstain_reason=row["abstain_reason"],
                neutralised_spans=row["neutralised_spans"],
                dropped_claims=row["dropped_claims"],
                latency_ms=row["latency_ms"],
                detail=_json_dict(row["detail"]),
            )
            for row in rows
        ],
        columns=_columns(),
    )


def _columns() -> list[str]:
    """The table's columns, read from the schema that creates it.

    From `SCHEMA` rather than from a list here, so the viewer's claim about what
    a row can hold cannot drift from what a row does hold.
    """
    body = SCHEMA.split("CREATE TABLE IF NOT EXISTS audit (", 1)[1].split(");", 1)[0]
    names = []
    for line in body.splitlines():
        stripped = line.strip().rstrip(",")
        if not stripped:
            continue
        names.append(stripped.split()[0])
    return names


def _json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except ValueError:
        return []
    return [str(item) for item in value] if isinstance(value, list) else []


def _json_dict(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None
