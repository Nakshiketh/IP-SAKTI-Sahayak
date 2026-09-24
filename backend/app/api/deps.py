"""What the routers are handed.

The stores, the index, the model client and the audit log are all process-wide
and expensive to build, so they are built once and cached. The rate limiter is
process-wide by definition.

`get_pipeline` is where a test swaps the whole thing out: override it and the
API runs against a different retriever or a different generator without any
router knowing.
"""

from __future__ import annotations

from functools import lru_cache

from fastapi import Header

from app.core.errors import RateLimited
from app.core.ratelimit import RateLimiter
from app.core.settings import Settings, get_settings
from app.llm.registry import build_llm_client
from app.records.store import RecordsStore
from app.retrieval.store import Namespaces
from app.services.audit import AuditLog
from app.services.feedback_store import FeedbackStore
from app.services.pipeline import Pipeline
from app.services.records_service import RecordsService
from app.services.translation import build_translator


@lru_cache
def get_namespaces() -> Namespaces:
    settings = get_settings()
    return Namespaces(settings.index_dir, settings.fixtures_dir, settings.knowledge_base_path)


@lru_cache
def get_audit_log() -> AuditLog:
    settings = get_settings()
    return AuditLog(settings.audit_db_path, enabled=settings.audit_enabled)


@lru_cache
def get_feedback_store() -> FeedbackStore:
    """Opinions, kept apart from whoever gave them."""
    return FeedbackStore(get_settings().feedback_db_path)


@lru_cache
def get_rate_limiter() -> RateLimiter:
    settings = get_settings()
    return RateLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)


@lru_cache
def get_records_service() -> RecordsService:
    """Layer 2, built once. Separate from the corpus by construction."""
    settings = get_settings()
    return RecordsService(RecordsStore(settings.records_db_path), settings.records_manifest_path)


@lru_cache
def get_pipeline() -> Pipeline:
    settings: Settings = get_settings()
    return Pipeline(
        settings=settings,
        namespaces=get_namespaces(),
        llm=build_llm_client(settings),
        translator=build_translator(settings),
        audit=get_audit_log(),
        records=get_records_service(),
    )


def enforce_rate_limit(session_id: str) -> None:
    retry_after = get_rate_limiter().check(session_id or "anonymous")
    if retry_after:
        raise RateLimited(retry_after)


def session_header(x_session_id: str | None = Header(default=None)) -> str:
    """The session id, from a header rather than a cookie.

    A header the client sets deliberately, not a cookie the browser sets for it:
    nothing here needs to survive a tab closing, and a cookie would attach an
    identifier to requests that do not want one.
    """
    return x_session_id or "anonymous"
