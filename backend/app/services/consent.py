"""Consent for a source this product will not fetch on its own.

A source marked ``user_credentialed`` in the manifest is never retrieved here,
under any flag. It is reached at query time through the reader's own
subscription, which means the reader — not this product — is the one paying for
and identified by the access. Nothing may go out under those credentials until
the reader has said so about that specific source, in a sentence that names it.

So consent is per source, never global. "Allow subscription sources" would be a
blanket the reader cannot see the edges of; "Use my Espacenet access for this
question" is a decision somebody can actually make.

**Where the record lives.** A grant is written to the audit log, which is
append-only, so a withdrawal is a second row rather than the deletion of the
first. That is on purpose: the reader's access log has to be able to show that
consent was held between two dates, and a store that erased the grant could not.
The state at any moment is the latest row for that source.

**What a row holds.** The session id, the source id, and the time. Not who the
reader is, not what their credentials are, and not the question — this product
never sees a credential at any point, and says so on the privacy page rather
than asking to be trusted about it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.services.audit import AuditLog, AuditRow

GRANTED = "consent.granted"
WITHDRAWN = "consent.withdrawn"
EVENTS = (GRANTED, WITHDRAWN)


@dataclass(frozen=True)
class ConsentEvent:
    """One row of the reader's access log."""

    source_id: str
    source_name: str
    granted: bool
    recorded_at: str


class ConsentLedger:
    """Reads and writes consent, over the audit log.

    Not a table of its own. Consent is one of the things the audit exists to
    record, and a second store would be a second answer to "what was agreed
    when", which is exactly the question that must have one answer.
    """

    def __init__(self, audit: AuditLog) -> None:
        self._audit = audit

    def record(self, *, session_id: str, source_id: str, source_name: str, granted: bool) -> None:
        self._audit.record(
            AuditRow(
                event=GRANTED if granted else WITHDRAWN,
                session_id=session_id,
                detail={"source_id": source_id, "source_name": source_name},
            )
        )

    def events_for(self, session_id: str, *, limit: int = 200) -> list[ConsentEvent]:
        """Every consent event in this session, newest first.

        The whole history, not the current state. An access log that showed only
        what is currently allowed would hide the grant a reader has since
        withdrawn, which is the row they are most likely to be looking for.
        """
        events: list[ConsentEvent] = []
        for row in self._audit.read_recent(limit=limit * 4):
            if row["event"] not in EVENTS or row["session_id"] != session_id:
                continue
            detail = _detail(row)
            events.append(
                ConsentEvent(
                    source_id=str(detail.get("source_id", "")),
                    source_name=str(detail.get("source_name", "")),
                    granted=row["event"] == GRANTED,
                    recorded_at=row["recorded_at"],
                )
            )
            if len(events) >= limit:
                break
        return events

    def granted_source_ids(self, session_id: str) -> set[str]:
        """Sources this session may currently use, from the latest row for each."""
        latest: dict[str, bool] = {}
        for event in reversed(self.events_for(session_id)):
            latest[event.source_id] = event.granted
        return {source_id for source_id, granted in latest.items() if granted}


def _detail(row: dict) -> dict:
    raw = row.get("detail")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}
