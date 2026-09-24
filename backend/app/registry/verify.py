"""Fetching a source from its official host, and recording what came back.

Verification is a narrow claim: these bytes were served by this official URL at
this time, and here is their hash. It says nothing about whether the passages
that cite the document report it correctly — a person establishes that, through
`scripts/registry_review.py`.

Three outcomes, and each is recorded rather than smoothed over:

* fetched — VERIFIED_OFFICIAL, with the hash and the time.
* not on the allowlist — NEEDS_REVIEW, and it cannot be cited. A document from
  a host nobody vetted never becomes authority by being mentioned.
* on the allowlist but unreachable from here — NEEDS_REVIEW with
  `legacy_allowed`, so a source known to be official keeps working while
  saying "provenance pending review" and holding confidence below high.
"""

from __future__ import annotations

import hashlib
import urllib.error
import urllib.request
from datetime import UTC, date, datetime
from pathlib import Path

from app.registry.hosts import is_allowlisted
from app.registry.models import ReviewState, SourceRecord

USER_AGENT = "IP-SAKTI-Sahayak-registry/1.0 (+source verification; contact via repository)"
TIMEOUT_SECONDS = 90

#: The headers an ordinary client sends. Some official hosts close the
#: connection without them. Nothing here imitates a particular browser or
#: works around an access control: a host that refuses this request is
#: recorded as unreachable, not retried in disguise.
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Connection": "close",
}

SUFFIX_BY_TYPE = {"application/pdf": ".pdf", "text/html": ".html", "text/plain": ".txt"}


def suffix_for(url: str, content_type: str | None) -> str:
    if content_type:
        for media, suffix in SUFFIX_BY_TYPE.items():
            if content_type.lower().startswith(media):
                return suffix
    return ".pdf" if url.lower().endswith(".pdf") else ".html"


def fetch(url: str) -> tuple[bytes, str | None]:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
        return response.read(), response.headers.get("Content-Type")


def verify(record: SourceRecord, raw_dir: Path | None = None) -> SourceRecord:
    """Fetch the source, store the bytes if a directory is given, and hash them."""
    url = record.official_url
    if not url:
        return record.model_copy(update={"notes": "No official URL recorded."})
    if not is_allowlisted(url):
        return record.model_copy(
            update={
                "review_state": ReviewState.NEEDS_REVIEW,
                "legacy_allowed": False,
                "citation_allowed": False,
                # Whatever hash the record carried was not established here, so
                # it is dropped rather than left to look like provenance.
                "sha256": None,
                "retrieved_at": None,
                "notes": "Host is not on the allowlist; add it deliberately or drop the source.",
            }
        )
    try:
        body, content_type = fetch(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as error:
        return record.model_copy(
            update={
                "review_state": ReviewState.NEEDS_REVIEW,
                "legacy_allowed": True,
                "notes": f"Could not be fetched on {date.today().isoformat()}: {error}",
            }
        )
    if raw_dir is not None:
        raw_dir.mkdir(parents=True, exist_ok=True)
        (raw_dir / (record.source_id + suffix_for(url, content_type))).write_bytes(body)
    return record.model_copy(
        update={
            "review_state": ReviewState.VERIFIED_OFFICIAL,
            "sha256": hashlib.sha256(body).hexdigest(),
            "retrieved_at": datetime.now(UTC),
            "full_text_available": raw_dir is not None,
            "legacy_allowed": False,
        }
    )
