"""Check whether the registered sources are still current.

    python scripts/source_health_check.py                 # report
    python scripts/source_health_check.py --write         # record the states
    python scripts/source_health_check.py --queue         # what a person must look at

The logic lives in `app/registry/health.py`, so it can be tested. What matters
most about it is what it will not do: a source whose bytes have changed is
queued for a person and never applied. Nothing here rewrites the corpus.
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.registry import health  # noqa: E402
from app.registry.store import SourceRegistry  # noqa: E402

REGISTRY_PATH = REPO_ROOT / "data" / "registry.sqlite3"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="record the states in the registry")
    parser.add_argument("--queue", action="store_true", help="only what needs a person")
    parser.add_argument("--limit", type=int, default=0, help="check at most this many")
    args = parser.parse_args(argv)

    registry = SourceRegistry(REGISTRY_PATH)
    if not registry.available:
        print(f"No registry at {REGISTRY_PATH}. Run: python scripts/registry_backfill.py")
        return 1

    today = datetime.now(UTC).date()
    records = [r for r in registry.all().values() if r.official_url]
    if args.limit:
        records = records[: args.limit]

    results = [health.check(record, today) for record in sorted(records, key=lambda r: r.source_id)]
    shown = [h for h in results if h.needs_a_person] if args.queue else results

    for row in shown:
        last = row.last_verified.isoformat() if row.last_verified else "never"
        print(f"  {row.state:18} {last:11} {row.source_id}")
        if row.detail:
            print(f"                                 {row.detail}")

    counts: dict[str, int] = {}
    for row in results:
        counts[row.state] = counts.get(row.state, 0) + 1
    print("\n" + ", ".join(f"{state}: {n}" for state, n in sorted(counts.items())))

    if args.write:
        print(f"\nMarked {health.apply_states(registry, results)} source(s) as needing review.")
        print("No corpus text was changed. A person approves any replacement.")

    queued = [h for h in results if h.needs_a_person]
    if queued:
        print(f"\n{len(queued)} source(s) need a person. Nothing was applied automatically.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
