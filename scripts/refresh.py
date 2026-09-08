"""Re-fetch, diff, report. What makes "kept current" true rather than claimed.

    python scripts/refresh.py                     # report only, writes nothing
    python scripts/refresh.py --write             # and rebuild the index

Refresh is deliberately read-only by default. Its job is to answer "has anything
we cite moved?", and that question is worth being able to ask without committing
to a rebuild — a diff that reports an amended act is something a person should
look at before the corpus changes underneath every past answer.

`--write` runs the full ingest, which retains the superseded wording with an
effective_to date and appends to `corpus/CHANGELOG.md`.

Run: python scripts/refresh.py --help
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))
# So `from ingest import ...` resolves whether this is run as a file or a module.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest import report_lines  # noqa: E402

from app.corpus import fetch as fetch_stage  # noqa: E402
from app.corpus import index as index_stage  # noqa: E402
from app.corpus.manifest import Manifest  # noqa: E402
from app.corpus.pipeline import Paths, ingest  # noqa: E402
from app.corpus.types import DocumentEntry  # noqa: E402


def compare(entry: DocumentEntry, paths: Paths) -> tuple[str, str]:
    """Fetch afresh and say whether the bytes differ from what is on record."""
    fetched, outcome = fetch_stage.fetch(
        entry,
        raw_dir=paths.raw_dir / "refresh",
        force=True,
        bases=(paths.manifest_dir, paths.repo_root),
    )
    if fetched is None:
        return "skipped", outcome.reason
    if not entry.checksum:
        return "new", "never ingested; nothing on record to compare against"
    if fetched.checksum == entry.checksum:
        return "unchanged", "checksum matches what was ingested"
    return "changed", "checksum differs from what was ingested"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--manifest", default=str(REPO_ROOT / "corpus" / "manifest.json"))
    parser.add_argument(
        "--index-dir",
        default=None,
        help="the index to compare against and rebuild (default: data/index)",
    )
    parser.add_argument(
        "--write", action="store_true", help="rebuild the index for what has changed"
    )
    parser.add_argument("--only", nargs="*", default=[], metavar="DOCUMENT_ID")
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = REPO_ROOT / manifest_path
    if not manifest_path.exists():
        print("No such manifest: " + str(manifest_path), file=sys.stderr)
        return 2

    index_dir = None
    if args.index_dir:
        index_dir = Path(args.index_dir)
        if not index_dir.is_absolute():
            index_dir = REPO_ROOT / index_dir

    manifest = Manifest.load(manifest_path)
    paths = Paths.for_manifest(REPO_ROOT, manifest_path, index_dir=index_dir)

    buckets: dict[str, list[tuple[str, str]]] = {}
    for entry in manifest.select(tuple(args.only)):
        state, reason = compare(entry, paths)
        buckets.setdefault(state, []).append((entry.document_id, reason))

    for state in ("changed", "new", "unchanged", "skipped"):
        rows = buckets.get(state, [])
        if not rows:
            continue
        print(state.upper() + " (" + str(len(rows)) + ")")
        for document_id, reason in rows:
            print("  " + document_id + " — " + reason)
        print()

    for jurisdiction in ("IN", "INTL"):
        meta = index_stage.read_meta(index_stage.index_path(paths.index_dir, jurisdiction))
        if meta:
            print(
                jurisdiction
                + " index: corpus "
                + meta.get("corpus_version", "?")
                + ", built "
                + meta.get("built_at", "?")
                + ", "
                + meta.get("chunk_count", "?")
                + " chunks"
            )

    changed = buckets.get("changed", []) + buckets.get("new", [])
    if not args.write:
        if changed:
            print()
            print(
                "Nothing was rebuilt. Run with --write to ingest the "
                + str(len(changed))
                + " document(s) above."
            )
        return 0

    report = ingest(
        manifest,
        paths,
        only=tuple(document_id for document_id, _reason in changed),
        force=True,
    )
    print()
    for line in report_lines(report):
        print(line)
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
