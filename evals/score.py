"""Run the gold set and write a report.

    python evals/score.py                      # everything
    python evals/score.py --only unanswerable  # one group, or one case id
    python evals/score.py --publish            # also copy the summary into the web app

Writes `evals/reports/report.md` for a person and `evals/reports/summary.json`
for `/how-it-works`, which renders whatever the last run produced — including the
numbers that look bad.

Exits non-zero when a metric with a target missed it, so a build can fail on
jurisdiction or authority purity dropping below 100%.

Run: python evals/score.py --help
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.core.settings import Settings  # noqa: E402
from app.evals.cases import load_gold  # noqa: E402
from app.evals.report import write_report  # noqa: E402
from app.evals.runner import run_gold  # noqa: E402
from app.evals.score import score_results  # noqa: E402

PUBLISHED = REPO_ROOT / "frontend" / "public" / "evals-summary.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--gold", default=str(REPO_ROOT / "evals" / "gold"), help="directory of gold JSONL files"
    )
    parser.add_argument(
        "--reports", default=str(REPO_ROOT / "evals" / "reports"), help="where to write the report"
    )
    parser.add_argument(
        "--only", nargs="*", default=[], metavar="GROUP_OR_ID", help="run a subset"
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="copy the summary into frontend/public so the site shows this run",
    )
    parser.add_argument(
        "--no-fail",
        action="store_true",
        help="report a missed target without exiting non-zero",
    )
    args = parser.parse_args(argv)

    gold_dir = Path(args.gold)
    if not gold_dir.is_absolute():
        gold_dir = REPO_ROOT / gold_dir
    reports_dir = Path(args.reports)
    if not reports_dir.is_absolute():
        reports_dir = REPO_ROOT / reports_dir

    try:
        gold = load_gold(gold_dir, only=tuple(args.only))
    except (FileNotFoundError, ValueError) as error:
        print("The gold set could not be read: " + str(error), file=sys.stderr)
        return 2

    if not gold.cases:
        print("No cases matched.", file=sys.stderr)
        return 2

    print("Running " + str(len(gold)) + " cases...")
    results, context = run_gold(gold, Settings())
    scores = score_results(results)
    report_path, summary_path = write_report(reports_dir, gold, results, scores, context)

    print()
    for key, metric in scores.metrics.items():
        flag = "  BELOW TARGET" if metric.meets_target is False else ""
        print("  " + key.ljust(30) + metric.display() + flag)

    print()
    print("Report:  " + report_path)
    print("Summary: " + summary_path)

    if args.publish:
        PUBLISHED.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(summary_path, PUBLISHED)
        print("Published to " + str(PUBLISHED))

    if scores.failures and not args.no_fail:
        print()
        print("Below target: " + ", ".join(scores.failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
