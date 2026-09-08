"""Health and corpus-version endpoints.

`corpus-version` exists from Phase 0 because the frontend footer reads the source
count and version from one place rather than hard-coding them in JSX. From Phase
10 it reads the running index rather than a setting, so the number it reports is
the number of documents actually being searched — and it says whether that is
the demo fixture or a built corpus.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.deps import get_namespaces
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
    #: True while any namespace is still served by the demo fixture. The
    #: interface uses it to mark every answer, so a demo can never look verified.
    is_demo: bool


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
    namespaces = get_namespaces()
    return CorpusVersion(
        corpus_version=namespaces.corpus_version(),
        document_count=namespaces.document_count(),
        # An "as of" date belongs to a corpus that was fetched. Nothing has
        # been, so this stays null rather than reporting today's date and
        # implying the sources were checked today.
        as_of_date=None,
        is_demo=namespaces.is_demo(),
    )
