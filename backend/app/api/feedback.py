"""Feedback and escalation.

Both write one audit row and say what they did. Neither pretends to more.

**Feedback** is split in two, on purpose. The audit log records *that* feedback
was given, against the session, because the audit trail has to be complete and
the rate limiter needs it. The verdict itself goes to `feedback_store`, which
holds no session, no account and no query id — so the opinion cannot be joined
back to the person who gave it. Free text is accepted and never stored: it is
the reader's own words about their own product, and keeping text nobody will
read is a liability rather than a feature.

**Escalation** records that a handoff was offered and taken. There is no expert
network behind it and there is no queue. What the product actually does is
assemble the summary the reader copies, and that happens in the browser. This
endpoint exists so the event is auditable, not so the interface can imply a
recipient.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import enforce_rate_limit, get_audit_log, get_feedback_store, session_header
from app.models.api import Acknowledgement, EscalateBody, FeedbackBody
from app.services.audit import AuditRow

router = APIRouter(prefix="/api/v1", tags=["feedback"])

#: The older vocabulary, still accepted so an interface mid-deploy keeps working.
LEGACY_VERDICTS = {
    "helpful": "yes",
    "not_helpful": "no",
    "wrong_source": "partly",
    "wrong_jurisdiction": "partly",
}


@router.post("/feedback", response_model=Acknowledgement)
def feedback(body: FeedbackBody, session_id: str = Depends(session_header)) -> Acknowledgement:
    session = body.session_id if body.session_id != "anonymous" else session_id
    enforce_rate_limit(session)

    verdict = LEGACY_VERDICTS.get(body.verdict, body.verdict)

    # The event, with the session, for the audit trail.
    get_audit_log().record(
        AuditRow(
            event="feedback",
            session_id=session,
            query_id=body.query_id,
            detail={"note_supplied": body.note is not None},
        )
    )
    # The opinion, with nobody attached to it.
    get_feedback_store().record(
        verdict,
        aspect=body.aspect,
        jurisdiction=body.jurisdiction,
        confidence=body.confidence,
        abstained=bool(body.abstained),
    )
    return Acknowledgement(
        recorded=True,
        note=(
            "Your verdict was recorded without anything identifying you. "
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
