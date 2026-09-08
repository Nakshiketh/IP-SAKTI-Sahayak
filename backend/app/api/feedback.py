"""Feedback and escalation.

Both write one audit row and say what they did. Neither pretends to more.

**Feedback** records the verdict and the query it was about. It deliberately does
not store the free-text note: a note is the reader's own words about their own
product, the product has no way to act on it today, and keeping text nobody will
read is a liability rather than a feature. The endpoint accepts the field so the
interface can offer the box, and says plainly that the text was not kept.

**Escalation** records that a handoff was offered and taken. There is no expert
network behind it and there is no queue. What the product actually does is
assemble the summary the reader copies, and that happens in the browser. This
endpoint exists so the event is auditable, not so the interface can imply a
recipient.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import enforce_rate_limit, get_audit_log, session_header
from app.models.api import Acknowledgement, EscalateBody, FeedbackBody
from app.services.audit import AuditRow

router = APIRouter(prefix="/api/v1", tags=["feedback"])

VERDICTS = frozenset({"helpful", "not_helpful", "wrong_source", "wrong_jurisdiction"})


@router.post("/feedback", response_model=Acknowledgement)
def feedback(body: FeedbackBody, session_id: str = Depends(session_header)) -> Acknowledgement:
    session = body.session_id if body.session_id != "anonymous" else session_id
    enforce_rate_limit(session)

    verdict = body.verdict if body.verdict in VERDICTS else "other"
    get_audit_log().record(
        AuditRow(
            event="feedback",
            session_id=session,
            query_id=body.query_id,
            detail={"verdict": verdict, "note_supplied": body.note is not None},
        )
    )
    return Acknowledgement(
        recorded=True,
        note=(
            "The verdict and the answer it refers to were recorded. "
            "Any note you typed was not stored."
        ),
    )


@router.post("/escalate", response_model=Acknowledgement)
def escalate(body: EscalateBody, session_id: str = Depends(session_header)) -> Acknowledgement:
    session = body.session_id if body.session_id != "anonymous" else session_id
    enforce_rate_limit(session)

    get_audit_log().record(
        AuditRow(
            event="escalate",
            session_id=session,
            query_id=body.query_id,
            jurisdiction=body.jurisdiction.value,
            detail={"product_class": body.product_class.value},
        )
    )
    return Acknowledgement(
        recorded=True,
        note=(
            "This was recorded. Nothing has been sent to anyone: there is no "
            "expert network behind this, and the summary is yours to send."
        ),
    )
