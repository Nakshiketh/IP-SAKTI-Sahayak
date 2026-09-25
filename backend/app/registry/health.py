"""Whether each registered source is still there, and still what we read.

A corpus pinned to a review date goes stale silently. An Act is amended, a
portal moves, a guideline is replaced — and every answer citing it keeps
sounding exactly as confident as it did the day it was checked.

**Nothing here replaces anything.** A source whose bytes have changed is marked
and queued for a person. It does not update the corpus, it does not touch the
live text, and it does not alter an answer. The point of a verified corpus is
that a machine cannot quietly rewrite what the law says; a monitor that
auto-updated would be that machine.

Only allowlisted hosts are fetched, and no URL comes from a user: every one is
read from the registry.
"""

from __future__ import annotations

import hashlib
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, timedelta

from app.registry.hosts import is_allowlisted
from app.registry.models import ReviewState, SourceRecord
from app.registry.store import SourceRegistry
from app.registry.verify import HEADERS, TIMEOUT_SECONDS

#: How long a source may go unchecked before it is due again. Six months is
#: short enough that an amendment does not sit unnoticed for a year, and long
#: enough that nobody starts ignoring the queue.
REVIEW_INTERVAL = timedelta(days=182)

# -- the states, and what each one means for the reader ------------------------

#: Fetched, and the bytes are the ones the registry recorded.
CURRENT = "current"
#: Unchanged, but past its review interval. Still cited; a person should look.
REVIEW_DUE = "review_due"
#: The bytes differ from the recorded hash. Queued, never applied.
CHANGED = "changed"
#: Could not be fetched from here. Says nothing about the source itself.
UNAVAILABLE = "unavailable"
#: The registry already records it as replaced.
SUPERSEDED = "superseded"
#: A person has to decide: no hash to compare, or an unresolved change.
NEEDS_HUMAN_REVIEW = "needs_human_review"

STATES = (CURRENT, REVIEW_DUE, CHANGED, UNAVAILABLE, SUPERSEDED, NEEDS_HUMAN_REVIEW)


@dataclass(frozen=True)
class Health:
    source_id: str
    state: str
    last_verified: date | None
    reachable: bool
    hash_changed: bool
    detail: str = ""

    @property
    def needs_a_person(self) -> bool:
        return self.state in {CHANGED, NEEDS_HUMAN_REVIEW}


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        return response.read()


def check(record: SourceRecord, today: date) -> Health:
    """One source. Never decides that a change is fine."""
    last = record.retrieved_at.date() if record.retrieved_at else None

    if record.review_state is ReviewState.SUPERSEDED:
        return Health(record.source_id, SUPERSEDED, last, True, False, "already replaced")

    url = record.official_url
    if not url or not is_allowlisted(url):
        # Never fetched from an unvetted host, whatever the registry holds.
        return Health(
            record.source_id, NEEDS_HUMAN_REVIEW, last, False, False, "no allowlisted URL"
        )

    try:
        body = fetch(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as error:
        # Unreachable from this machine says nothing about the source. It stays
        # citable and someone checks by hand.
        return Health(record.source_id, UNAVAILABLE, last, False, False, str(error)[:120])

    digest = hashlib.sha256(body).hexdigest()
    if not record.sha256:
        return Health(record.source_id, NEEDS_HUMAN_REVIEW, last, True, False, "no recorded hash")

    if digest != record.sha256:
        # Queued. Nothing here rewrites the corpus.
        return Health(record.source_id, CHANGED, last, True, True, f"now {digest[:12]}")

    if last is None or today - last > REVIEW_INTERVAL:
        return Health(record.source_id, REVIEW_DUE, last, True, False, "past the review interval")

    return Health(record.source_id, CURRENT, last, True, False, "")


def apply_states(registry: SourceRegistry, results: list[Health]) -> int:
    """Record what was found, without changing what any answer says.

    A changed source moves to NEEDS_REVIEW so the interface marks its citations
    as provenance-pending. Its text is untouched: the reader sees the same
    words with an honest warning, rather than different words nobody approved.
    """
    updated: list[SourceRecord] = []
    for health in results:
        if not health.needs_a_person:
            continue
        record = registry.get(health.source_id)
        if record is None or record.review_state is ReviewState.NEEDS_REVIEW:
            continue
        updated.append(
            record.model_copy(
                update={
                    "review_state": ReviewState.NEEDS_REVIEW,
                    "legacy_allowed": True,
                    "notes": f"{health.state} on {date.today().isoformat()}: {health.detail}",
                }
            )
        )
    if updated:
        registry.write(updated)
    return len(updated)
