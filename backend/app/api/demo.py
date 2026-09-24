"""The flagship case, served as a question and nothing else.

The one thing this endpoint must never return is an answer. A demo that serves
a stored result would prove nothing about the system, and a jury is entitled to
assume that what they are shown was produced while they watched. So this hands
back the question, the interface puts it through the ordinary ask path, and the
answer is computed live from the same corpus as anyone else's.

Kept behind `feature_jury_demo` so the panel can be turned off for a deployment
that should not offer it, without removing the case itself.
"""

from __future__ import annotations

import json
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from app.core.settings import REPO_ROOT, Settings, get_settings
from app.models.api import Wire

router = APIRouter(prefix="/api/v1", tags=["demo"])

CASE_PATH = REPO_ROOT / "data" / "demo" / "flagship_case.json"


class DemoCase(Wire):
    id: str
    language: str
    question: str


@lru_cache(maxsize=1)
def _case() -> DemoCase:
    raw = json.loads(CASE_PATH.read_text("utf-8"))
    # Only these three fields are read. If someone ever adds a stored answer to
    # the file, it does not reach the interface through here.
    return DemoCase(id=raw["id"], language=raw["language"], question=raw["question"])


@router.get("/demo/flagship-case", response_model=DemoCase)
def flagship_case() -> DemoCase:
    settings: Settings = get_settings()
    if not settings.feature_jury_demo:
        raise HTTPException(status_code=404, detail="The jury demo is not enabled.")
    if not CASE_PATH.exists():
        raise HTTPException(status_code=404, detail="No flagship case is seeded.")
    return _case()
