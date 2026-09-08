"""Load the records layer from a records manifest.

    python scripts/ingest_records.py                          # the real source set
    python scripts/ingest_records.py \
        --manifest corpus/samples/records-manifest.json \
        --database data/records-samples.sqlite3               # the fixture registry

Layer 2, and separate from the corpus in every way that matters: its own
database, its own manifest, its own CLI, no embeddings, and nothing it writes
can be cited as authority.

Today the real manifest ingests nothing. Every one of its 17 sources either is a
portal — which this pipeline never fetches, at all — or has a licence nobody has
read, and an unread licence means no ingestion. The run says so per source
rather than reporting a total.

Run: python scripts/ingest_records.py --help
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.records.ingest import RecordsReport, ingest_aggregates, ingest_source  # noqa: E402
from app.records.manifest import RecordsManifest  # noqa: E402
from app.records.store import RecordsStore  # noqa: E402
from app.records.types import RecordAccessMode  # noqa: E402


def report_lines(report: RecordsReport, store: RecordsStore) -> list[str]:
    lines: list[str] = []

    if report.failures():
        lines.append("FAILED — these sources did not load:")
        for outcome in report.failures():
            lines.append("  " + outcome.source_id + " — " + outcome.reason)
        lines.append("")

    if report.skips():
        lines.append("Not ingested:")
        for outcome in report.skips():
            lines.append("  " + outcome.source_id + " — " + outcome.reason)
        lines.append("")

    loaded = [outcome for outcome in report.outcomes if outcome.ok]
    if loaded:
        lines.append("Loaded:")
        for outcome in loaded:
            lines.append(
                "  "
                + outcome.source_id
                + ": "
                + outcome.reason
                + " ("
                + str(outcome.rows_added)
                + " added, "
                + str(outcome.rows_changed)
                + " changed, "
                + str(outcome.rows_removed)
                + " removed)"
            )
        lines.append("")

    lines.append(
        str(report.records_written)
        + " record(s) and "
        + str(report.aggregates_written)
        + " aggregate row(s) written · "
        + str(store.count())
        + " record(s) in the store"
    )
    if not loaded:
        lines.append("Nothing was ingested. No licence was assumed and no portal was fetched.")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--manifest",
        default=str(REPO_ROOT / "corpus" / "records-manifest.json"),
        help="records manifest to load from (default: the real source set)",
    )
    parser.add_argument(
        "--database",
        default=None,
        help="where to write the records database (default: data/records.sqlite3)",
    )
    parser.add_argument("--only", nargs="*", default=[], metavar="SOURCE_ID")
    parser.add_argument(
        "--no-write-back",
        action="store_true",
        help="do not write snapshot fields back into the manifest",
    )
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = REPO_ROOT / manifest_path
    if not manifest_path.exists():
        print("No such records manifest: " + str(manifest_path), file=sys.stderr)
        return 2

    database = Path(args.database) if args.database else REPO_ROOT / "data" / "records.sqlite3"
    if not database.is_absolute():
        database = REPO_ROOT / database

    manifest = RecordsManifest.load(manifest_path)
    store = RecordsStore(database)
    report = RecordsReport()
    updates: dict[str, dict] = {}

    for source in manifest.select(tuple(args.only)):
        if source.record_type == "aggregate_statistic":
            outcome = ingest_aggregates(source, store, data_dir=manifest_path.parent)
            if outcome.ok:
                report.aggregates_written += outcome.rows_total
        else:
            outcome = ingest_source(source, store, data_dir=manifest_path.parent)
            if outcome.ok:
                report.records_written += outcome.rows_total
        report.add(outcome)

        if outcome.ok:
            snapshot = next(iter(store.snapshots(source.source_id)), None)
            if snapshot is not None:
                updates[source.source_id] = {
                    "last_snapshot_at": snapshot.taken_at.isoformat(),
                    "snapshot_checksum": snapshot.checksum,
                    "record_count": outcome.rows_total,
                }

    # A portal is listed on the sources page whether or not anything was
    # ingested, so its licence and terms note reach the interface. Recording it
    # is not ingesting it: no fetch happened and no record was written.
    for portal in manifest.sources:
        if portal.access_mode is RecordAccessMode.PORTAL_LINK_ONLY and store.available:
            store.upsert_source(portal)

    for line in report_lines(report, store):
        print(line)

    if updates and not args.no_write_back:
        manifest.write_back(updates)

    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
