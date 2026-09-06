"""Health and corpus-version endpoints.

`corpus-version` exists from Phase 0 because the frontend footer reads the source
count and version from one place rather than hard-coding them in JSX.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.settings import Settings, get_settings

router = APIRouter(prefix="/api/v1", tags=["system"])


class Health(BaseModel):
    status: str
    app_name: str
    environment: str


class CorpusVersion(BaseModel):
    corpus_version: str
    document_count: int
    as_of_date: str | None


@router.get("/health", response_model=Health)
def health() -> Health:
    settings: Settings = get_settings()
    return Health(
        status="ok",
        app_name=settings.app_name,
        environment=settings.environment,
    )


@router.get("/corpus-version", response_model=CorpusVersion)
def corpus_version() -> CorpusVersion:
    settings: Settings = get_settings()
    # No corpus is built until Phase 11. Report that honestly rather than
    # inventing a document count.
    return CorpusVersion(
        corpus_version=settings.corpus_version,
        document_count=0,
        as_of_date=None,
    )
