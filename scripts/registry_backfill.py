"""Register every source the product knows about, and fetch what it can.

    python scripts/registry_backfill.py              # register and fetch
    python scripts/registry_backfill.py --no-fetch   # register only
    python scripts/registry_backfill.py --only in-patents-act-1970

What it registers:

* `corpus/guidance/sources.json` — the documents answers cite today. Each one
  is fetched from its official URL, the bytes are saved under `corpus/raw/`
  (gitignored) and hashed, and the record becomes VERIFIED_OFFICIAL.
* `corpus/manifest.json` — the wider library planned for full-text search.
  Those entries carry no URL, so they are registered UNVERIFIED and cannot be
  cited.

What it never does: invent a date, a version or a status. A fetch that fails
leaves the record NEEDS_REVIEW with the reason, and `legacy_allowed` set for a
document that is plainly official but cannot be re-fetched today — it stays
citable, says "provenance pending review", and caps confidence for that answer.

Run `python scripts/registry_review.py --pending` afterwards to see what a
person still has to confirm.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.registry.models import (  # noqa: E402
    AUTHORITY_LEVEL_BY_TYPE,
    ReviewState,
    SourceRecord,
)
from app.registry.store import SourceRegistry  # noqa: E402
from app.registry.verify import verify  # noqa: E402

RAW_DIR = REPO_ROOT / "corpus" / "raw"

#: A page served as an application rather than a document: its bytes change
#: between visits, so the hash records what was served, not a stable text.
PORTAL_PREFIX = "in-portal-"

#: An authority named this way publishes the page, it does not enact the text
#: on it, so the page is level 3 however its document_type reads.
PAGE_MARKERS = ("portal", "website", "web site", "home page", "homepage")


def authority_level(document_id: str, document_type: str, authority: str = "") -> int:
    """Statutes and rules are level 1; guidelines 2; official pages and portals 3."""
    if document_id.startswith(PORTAL_PREFIX):
        return 3
    if any(marker in authority.lower() for marker in PAGE_MARKERS):
        return 3
    return AUTHORITY_LEVEL_BY_TYPE.get(document_type, 3)


def as_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def guidance_records(reviewed_on: date) -> list[SourceRecord]:
    raw = json.loads((REPO_ROOT / "corpus" / "guidance" / "sources.json").read_text("utf-8"))
    records = []
    for entry in raw["documents"]:
        level = authority_level(entry["document_id"], entry["document_type"], entry["organization"])
        records.append(
            SourceRecord(
                source_id=entry["document_id"],
                title=entry["document_title"],
                authority=entry["organization"],
                jurisdiction=entry["jurisdiction"],
                document_type=entry["document_type"],
                authority_level=level,
                official_url=entry["source_url"],
                effective_date=as_date(entry.get("effective_from")),
                version=entry.get("version_label"),
                # The passages restate these documents; the documents themselves
                # are only stored under corpus/raw/ once fetched below.
                primary_or_secondary="primary" if level <= 2 else "secondary",
                reviewed_at=reviewed_on,
                review_state=ReviewState.NEEDS_REVIEW,
                notes=(
                    "Interactive official portal; the bytes served change between visits."
                    if entry["document_id"].startswith(PORTAL_PREFIX)
                    else None
                ),
            )
        )
    return records


def manifest_records() -> list[SourceRecord]:
    raw = json.loads((REPO_ROOT / "corpus" / "manifest.json").read_text("utf-8"))
    records = []
    for entry in raw["documents"]:
        records.append(
            SourceRecord(
                source_id=entry["document_id"],
                title=entry["title"],
                authority=entry["organization"],
                jurisdiction=entry["jurisdiction"],
                document_type=entry["document_type"],
                legal_area=[entry["group"]] if entry.get("group") else [],
                authority_level=authority_level(
                    entry["document_id"], entry["document_type"], entry["organization"]
                ),
                official_url=entry.get("source_url"),
                publication_date=as_date(entry.get("publication_date")),
                effective_date=as_date(entry.get("effective_from")),
                version=entry.get("version_label"),
                supersedes=list(entry.get("supersedes") or []),
                superseded_by=entry.get("superseded_by"),
                primary_or_secondary="primary",
                full_text_available=False,
                review_state=ReviewState.UNVERIFIED,
                notes="Planned for full-text indexing; not fetched, so not citable.",
            )
        )
    return records


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-fetch", action="store_true", help="register without fetching")
    parser.add_argument("--only", help="one source id")
    args = parser.parse_args(argv)

    guidance_raw = json.loads(
        (REPO_ROOT / "corpus" / "guidance" / "sources.json").read_text("utf-8")
    )
    reviewed_on = date.fromisoformat(guidance_raw["reviewed_on"])

    # The two files overlap: an Act can be both a document answers cite today
    # and an entry in the planned full-text library. The verified guidance
    # record wins, and the manifest only fills in what it does not carry.
    records_by_id: dict[str, SourceRecord] = {r.source_id: r for r in guidance_records(reviewed_on)}
    for entry in manifest_records():
        existing = records_by_id.get(entry.source_id)
        if existing is None:
            records_by_id[entry.source_id] = entry
            continue
        records_by_id[entry.source_id] = existing.model_copy(
            update={
                "legal_area": existing.legal_area or entry.legal_area,
                "publication_date": existing.publication_date or entry.publication_date,
                "effective_date": existing.effective_date or entry.effective_date,
                "supersedes": existing.supersedes or entry.supersedes,
                "superseded_by": existing.superseded_by or entry.superseded_by,
            }
        )
    records = list(records_by_id.values())
    if args.only:
        records = [r for r in records if r.source_id == args.only]
        if not records:
            print(f"No source with id {args.only}")
            return 1

    if not args.no_fetch:
        for index, record in enumerate(records):
            if record.review_state is ReviewState.UNVERIFIED:
                continue  # nothing to fetch: the manifest carries no URL
            records[index] = verify(record, RAW_DIR)
            print(f"  {records[index].review_state.value:17} {record.source_id}")

    registry = SourceRegistry(REPO_ROOT / "data" / "registry.sqlite3")
    # Re-registering must not throw away provenance. What this run did not
    # fetch keeps the state, hash and review it already had.
    known = registry.all()
    for index, record in enumerate(records):
        previous = known.get(record.source_id)
        if previous is None or record.sha256 is not None:
            continue
        records[index] = record.model_copy(
            update={
                "review_state": previous.review_state,
                "sha256": previous.sha256,
                "retrieved_at": previous.retrieved_at,
                "reviewed_at": previous.reviewed_at or record.reviewed_at,
                "reviewed_by": previous.reviewed_by,
                "legacy_allowed": previous.legacy_allowed,
                "full_text_available": previous.full_text_available,
                "notes": previous.notes or record.notes,
            }
        )
    registry.write(records)

    counts = registry.counts_by_state()
    print("\nRegistry:", registry._path)
    for state, count in sorted(counts.items()):
        print(f"  {state:17} {count}")
    print("  citable          ", len(registry.usable_ids()))
    print("  version          ", registry.registry_version())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
