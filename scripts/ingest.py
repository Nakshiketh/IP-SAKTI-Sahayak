"""Build the corpus index from a manifest.

    python scripts/ingest.py                       # the real source set
    python scripts/ingest.py --manifest corpus/samples/manifest.json \
        --index-dir data/index-samples             # the fixture documents

Idempotent: a document whose bytes have not changed reuses its cached parse and
segmentation. `--force` throws that away. Resumable: a document that fails takes
only itself down, and every outcome is reported at the end.

The real manifest has no verified source URLs yet, so today this run reports 37
skips and builds nothing. That is the honest state of a corpus nobody has
fetched, and it is why the sample manifest exists — it is what proves the
pipeline works end to end while the real one is empty.

Run: python scripts/ingest.py --help
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.corpus.manifest import Manifest  # noqa: E402
from app.corpus.pipeline import Paths, ingest  # noqa: E402
from app.corpus.types import IngestReport, Outcome  # noqa: E402

STAGE_ORDER = ("fetch", "parse", "segment", "enrich", "embed", "validate", "index")


def report_lines(report: IngestReport) -> list[str]:
    lines: list[str] = []

    failures = report.failures()
    skips = report.skips()

    if failures:
        lines.append("FAILED — these documents did not enter the index:")
        for outcome in failures:
            lines.append("  " + outcome.document_id + " [" + outcome.stage + "] " + outcome.reason)
        lines.append("")

    if skips:
        lines.append("Skipped:")
        for outcome in skips:
            lines.append("  " + outcome.document_id + " [" + outcome.stage + "] " + outcome.reason)
        lines.append("")

    indexed = [o for o in report.outcomes if o.stage == "index" and o.outcome is Outcome.OK]
    if indexed:
        lines.append("Indexed:")
        for outcome in indexed:
            retained = outcome.detail.get("retained", 0)
            suffix = " (" + str(retained) + " retained from a previous version)" if retained else ""
            lines.append("  " + outcome.document_id + ": " + outcome.reason + suffix)
        lines.append("")

    lines.append(
        "corpus version "
        + (report.corpus_version or "unchanged")
        + " · "
        + str(report.documents_indexed)
        + " document(s) · "
        + str(report.chunks_written)
        + " chunk(s)"
    )
    if not indexed:
        lines.append("Nothing was indexed. Nothing was guessed either.")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--manifest",
        default=str(REPO_ROOT / "corpus" / "manifest.json"),
        help="manifest to build from (default: the real source set)",
    )
    parser.add_argument(
        "--index-dir",
        default=None,
        help="where to write the index (default: data/index)",
    )
    parser.add_argument(
        "--only", nargs="*", default=[], metavar="DOCUMENT_ID", help="build only these documents"
    )
    parser.add_argument(
        "--force", action="store_true", help="re-fetch and re-parse, ignoring every cache"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat a skipped document as a failure (for a build meant to be complete)",
    )
    parser.add_argument(
        "--no-review",
        action="store_true",
        help="do not write corpus/tags-review.jsonl",
    )
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
    paths = Paths.for_manifest(REPO_ROOT, manifest_path, index_dir=index_dir)

    manifest = Manifest.load(manifest_path)
    report = ingest(
        manifest,
        paths,
        only=tuple(args.only),
        force=args.force,
        strict=args.strict,
        write_review=not args.no_review,
    )

    for line in report_lines(report):
        print(line)

    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
