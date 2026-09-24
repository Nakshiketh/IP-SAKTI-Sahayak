"""Let a person confirm a source against the official original.

    python scripts/registry_review.py --pending
    python scripts/registry_review.py --show in-patents-act-1970
    python scripts/registry_review.py --approve in-patents-act-1970 --by "A. Reviewer"

Fetching proves where bytes came from. It does not prove that the passages in
`corpus/guidance/knowledge-base.json` say what the document says — only a
person who reads both can do that, and this is where they record it.

Approving marks the source HUMAN_REVIEWED with the reviewer's name and today's
date. A source that has not been fetched cannot be approved: review confirms a
verified source, it does not stand in for verification.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.registry.models import ReviewState  # noqa: E402
from app.registry.store import SourceRegistry  # noqa: E402

REGISTRY_PATH = REPO_ROOT / "data" / "registry.sqlite3"


def line(record) -> str:
    flag = "" if not record.legacy_allowed else "  [provenance pending]"
    level = record.authority_level or "?"
    return f"  {record.review_state.value:17} L{level}  {record.source_id}{flag}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pending", action="store_true", help="sources waiting for a person")
    parser.add_argument("--all", action="store_true", help="every registered source")
    parser.add_argument("--show", metavar="SOURCE_ID", help="one source in full")
    parser.add_argument("--approve", metavar="SOURCE_ID", help="mark it human-reviewed")
    parser.add_argument("--by", help="the reviewer's name, required with --approve")
    args = parser.parse_args(argv)

    registry = SourceRegistry(REGISTRY_PATH)
    if not registry.available:
        print(f"No registry at {REGISTRY_PATH}. Run: python scripts/registry_backfill.py")
        return 1

    if args.show:
        record = registry.get(args.show)
        if record is None:
            print(f"No source with id {args.show}")
            return 1
        for field, value in record.model_dump().items():
            if value not in (None, [], ""):
                print(f"  {field:22} {value}")
        return 0

    if args.approve:
        if not args.by:
            print('--approve needs --by "name of the person who checked it"')
            return 1
        try:
            record = registry.mark_reviewed(args.approve, args.by, date.today())
        except KeyError:
            print(f"No source with id {args.approve}")
            return 1
        except ValueError as error:
            print(error)
            return 1
        print(f"{record.source_id} is now {record.review_state.value}, by {record.reviewed_by}")
        return 0

    records = sorted(registry.all().values(), key=lambda r: (r.review_state.value, r.source_id))
    if args.all:
        for record in records:
            print(line(record))
        return 0

    pending = [r for r in records if r.review_state is not ReviewState.HUMAN_REVIEWED]
    fetched = [r for r in pending if r.review_state is ReviewState.VERIFIED_OFFICIAL]
    unfetched = [r for r in pending if r.review_state is not ReviewState.VERIFIED_OFFICIAL]

    print(f"Fetched and hashed, waiting for a person to confirm the text ({len(fetched)}):")
    for record in fetched:
        print(line(record))
    print(f"\nNot fetched, so not confirmable yet ({len(unfetched)}):")
    for record in unfetched:
        print(line(record))
    print("\nApprove one after reading it against the official original:")
    print('  python scripts/registry_review.py --approve <source_id> --by "Your name"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
