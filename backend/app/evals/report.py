"""Writing the report a person reads, and the summary the site reads.

The markdown leads with what the run was measured against, because a number
without that context is misleading in a specific and predictable way: with no
corpus ingested, most questions abstain for want of anything to answer from, and
"abstention precision 30%" then reads as a fault in the abstention rule rather
than as the honest consequence of an empty index.

The JSON summary is what `/how-it-works` renders. It carries every metric,
including the ones that are not measured and the ones that look bad, because a
summary that only carried the good numbers would make the page a claim rather
than a report.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.evals.cases import GoldSet
from app.evals.runner import CaseResult, RunContext
from app.evals.score import Scores

#: The order metrics appear in, both in the report and on the site.
ORDER = (
    "jurisdiction_purity",
    "authority_purity",
    "citation_validity",
    "citation_groundedness",
    "citation_coverage",
    "abstention_precision",
    "abstention_recall",
    "abstention_reason_accuracy",
    "forbidden_claim_avoidance",
    "classification_accuracy",
    "language_detection_accuracy",
    "records_offered",
    "records_do_not_rescue",
    "latency_p50",
    "latency_p95",
    "errors",
    "answer_accuracy",
    "citation_correctness",
    "multilingual_quality",
)


def corpus_caveat(context: RunContext) -> str:
    if context.corpus_is_demo:
        return (
            "**These numbers were measured against a demonstration corpus of "
            + str(context.corpus_documents)
            + " illustrative documents, not against the real source set.** No document from "
            "`corpus/manifest.json` has been ingested, because none has a verified source URL. "
            "So most questions here abstain for want of anything to answer from, and the "
            "abstention and coverage figures below measure the machinery rather than the "
            "product's coverage. The purity and groundedness figures are meaningful now; the "
            "coverage figures will only become meaningful once documents are ingested."
        )
    return (
        "Measured against corpus version "
        + context.corpus_version
        + ", "
        + str(context.corpus_documents)
        + " documents."
    )


def render_markdown(
    gold: GoldSet, results: list[CaseResult], scores: Scores, context: RunContext
) -> str:
    when = datetime.now(UTC)
    lines: list[str] = [
        "# Evaluation report",
        "",
        "Run at " + when.isoformat(timespec="seconds") + ".",
        "",
        corpus_caveat(context),
        "",
        "## What ran",
        "",
        "| | |",
        "| --- | --- |",
        "| Cases | " + str(len(gold)) + " |",
        "| Corpus version | " + context.corpus_version + " |",
        "| Corpus documents | " + str(context.corpus_documents) + " |",
        "| Records ingested | " + str(context.records_count) + " |",
        "| Generator | " + context.generator + " |",
        "| Translator | " + context.translator + " |",
        "",
        "## Metrics",
        "",
        "| Metric | Result | Target | Note |",
        "| --- | --- | --- | --- |",
    ]

    for key in ORDER:
        metric = scores.get(key)
        if metric is None:
            continue
        target = (
            f"{metric.target * 100:.0f}%"
            if metric.target is not None and metric.unit == "percent"
            else ""
        )
        note = metric.note or metric.not_measured_reason or ""
        flag = ""
        if metric.meets_target is False:
            flag = " **below target**"
        lines.append(
            "| `" + key + "` | " + metric.display() + flag + " | " + target + " | " + note + " |"
        )

    lines += ["", "## By group", "", "| Group | Cases | Answered | Declined | Errors |",
              "| --- | --- | --- | --- | --- |"]
    for group, cases in sorted(gold.by_group().items()):
        ids = {case.id for case in cases}
        rows = [r for r in results if r.case.id in ids]
        lines.append(
            "| "
            + group
            + " | "
            + str(len(rows))
            + " | "
            + str(sum(1 for r in rows if r.behaviour == "answer"))
            + " | "
            + str(sum(1 for r in rows if r.behaviour == "abstain"))
            + " | "
            + str(sum(1 for r in rows if r.behaviour == "error"))
            + " |"
        )

    lines += ["", "## Composition", "", "| Language | Cases |", "| --- | --- |"]
    for language, count in sorted(gold.languages().items()):
        lines.append("| " + language + " | " + str(count) + " |")

    below = [key for key in ORDER if (scores.get(key) or MetricStub()).meets_target is False]
    lines += ["", "## What is below target", ""]
    if below:
        for key in below:
            metric = scores.get(key)
            assert metric is not None
            lines.append("- `" + key + "` at " + metric.display() + " — " + metric.note)
    else:
        lines.append("Nothing. Every metric with a target met it.")

    errored = [r for r in results if r.behaviour == "error"]
    if errored:
        lines += ["", "## Cases that raised", ""]
        for result in errored:
            lines.append("- `" + result.case.id + "` — " + str(result.error))

    lines += [
        "",
        "## Every case",
        "",
        "| Case | Expected | Got | Reason | Confidence | Citations | Records |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for result in results:
        lines.append(
            "| `"
            + result.case.id
            + "` | "
            + result.case.expected_behaviour
            + " | "
            + result.behaviour
            + " | "
            + (result.abstain_reason or "")
            + " | "
            + result.confidence
            + " | "
            + str(len(result.cited_document_ids))
            + " | "
            + str(len(result.related_record_ids))
            + " |"
        )

    return "\n".join(lines) + "\n"


class MetricStub:
    meets_target = None


def render_summary(scores: Scores, context: RunContext, gold: GoldSet) -> dict:
    """The JSON `/how-it-works` reads.

    `metrics` is a flat map of name to already-formatted string, because the
    page renders whatever it is given and must not do arithmetic on numbers it
    did not compute. Everything else is context the page shows beside them.
    """
    return {
        "run_at": datetime.now(UTC).date().isoformat(),
        "metrics": {
            key: (scores.get(key).display() if scores.get(key) else "not measured")
            for key in ORDER
        },
        "case_count": len(gold),
        "corpus_version": context.corpus_version,
        "corpus_documents": context.corpus_documents,
        "corpus_is_demo": context.corpus_is_demo,
        "records_count": context.records_count,
        "generator": context.generator,
        "caveat": corpus_caveat(context).replace("**", ""),
        "below_target": scores.failures,
    }


def write_report(
    directory,
    gold: GoldSet,
    results: list[CaseResult],
    scores: Scores,
    context: RunContext,
) -> tuple[str, str]:
    directory.mkdir(parents=True, exist_ok=True)
    report_path = directory / "report.md"
    summary_path = directory / "summary.json"

    report_path.write_text(
        render_markdown(gold, results, scores, context), encoding="utf-8", newline="\n"
    )
    summary_path.write_text(
        json.dumps(render_summary(scores, context, gold), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return str(report_path), str(summary_path)
