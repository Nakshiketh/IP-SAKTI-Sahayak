"""System-level numbers, for the people who run this rather than use it.

Everything here comes from `app.services.insight`, which reads the audit log and
nothing else. The audit log holds a hash of each question and never the words,
so there is no route from this endpoint to what anyone asked — not by accident,
not by a later mistake, and not by someone with the URL.

Three guards, and each is here for a different reason:

* **The flag.** A deployment that should not publish its own usage can turn the
  whole thing off, and the route stops existing rather than starting to refuse.
* **A session.** Aggregates are not public. Small buckets are already withheld,
  but the totals still describe a real deployment.
* **An allowlist.** Signing in is not enough. The accounts table has no role
  column, and rather than invent one — which is a migration, on a table
  everyone's sign-in depends on — the admins are named in configuration. It is
  a smaller thing to get wrong and an obvious thing to read.

The one design decision worth defending: this refuses with 403 rather than 404
for a signed-in non-admin. Hiding the route would be security through obscurity
in a repository anyone can read, and it would turn a permissions problem into a
mystery for whoever is trying to work out why their dashboard is empty.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import current_user
from app.core.settings import Settings, get_settings
from app.models.api import Wire
from app.services import insight as insight_service

router = APIRouter(prefix="/api/v1", tags=["admin"])


class BucketOut(Wire):
    name: str
    count: int


class GapOut(Wire):
    reason: str
    count: int


class InsightOut(Wire):
    total_queries: int
    by_jurisdiction: list[BucketOut] = []
    by_language: list[BucketOut] = []
    by_abstain_reason: list[BucketOut] = []
    most_used_sources: list[BucketOut] = []
    knowledge_gaps: list[GapOut] = []
    #: How many buckets were withheld for being too small to report. Reported
    #: rather than silently dropped: a reader is entitled to know the picture
    #: is incomplete, and why.
    suppressed_buckets: int = 0
    minimum_bucket: int = insight_service.MIN_BUCKET
    abstention_rate: float | None = None
    escalation_rate: float | None = None
    refusal_rate: float | None = None
    latency_p50_ms: int | None = None
    latency_p95_ms: int | None = None
    #: Says whose data this is. A demo number read as a national one is the
    #: failure this field exists to prevent.
    provenance: str = insight_service.LOCAL_DATA


@router.get("/admin/insight", response_model=InsightOut)
def admin_insight(username: Annotated[str, Depends(current_user)]) -> InsightOut:
    settings: Settings = get_settings()
    if not settings.feature_admin_insights:
        raise HTTPException(status_code=404, detail="Insights are not enabled.")
    if username not in settings.admin_username_list:
        raise HTTPException(
            status_code=403,
            detail="This account is not an administrator of this deployment.",
        )

    found = insight_service.summarise(settings.audit_db_path)
    return InsightOut(
        total_queries=found.total_queries,
        by_jurisdiction=[BucketOut(name=b.name, count=b.count) for b in found.by_jurisdiction],
        by_language=[BucketOut(name=b.name, count=b.count) for b in found.by_language],
        by_abstain_reason=[BucketOut(name=b.name, count=b.count) for b in found.by_abstain_reason],
        most_used_sources=[BucketOut(name=b.name, count=b.count) for b in found.most_used_sources],
        knowledge_gaps=[GapOut(reason=g.reason, count=g.count) for g in found.knowledge_gaps],
        suppressed_buckets=found.suppressed_buckets,
        abstention_rate=found.abstention_rate,
        escalation_rate=found.escalation_rate,
        refusal_rate=found.refusal_rate,
        latency_p50_ms=found.latency_p50_ms,
        latency_p95_ms=found.latency_p95_ms,
        provenance=found.provenance,
    )
