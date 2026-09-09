"""Scoring a run.

Every metric here is either computed from what actually happened or reported as
not measured with the reason. There is no third state, and in particular there
is no placeholder number: a figure invented to fill a row gets quoted, and once
quoted it is indistinguishable from a measurement.

Two of the metrics the build document asks for are in the second category today.
`answer_accuracy` needs reference answers to judge against, and none have been
written because writing a hundred and seventy model statements of law from
memory is the fabrication this product exists to prevent. `multilingual_quality`
needs a native speaker. Both say so.

`citation_correctness` — whether a cited passage actually supports the claim —
also needs a judge. What can be measured without one is narrower and still worth
having, so it is reported under its own name: `citation_groundedness`, the share
of citations pointing at a passage that was really retrieved for that question.
Reporting it as citation correctness would be claiming more than was measured.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.evals.runner import CaseResult

#: Metrics the build document requires that cannot be computed here, and why.
NOT_MEASURED: dict[str, str] = {
    "answer_accuracy": (
        "No reference answers exist. Writing them means stating what a source says, and no "
        "source has been read — see evals/gold/README.md."
    ),
    "citation_correctness": (
        "Whether a cited passage supports its claim needs a judge, human or model. "
        "citation_groundedness below measures what can be checked mechanically."
    ),
    "multilingual_quality": (
        "Needs a native-speaker rubric over a 30-question subset. "
        "language_detection_accuracy below measures the part a machine can."
    ),
}


@dataclass
class MetricResult:
    key: str
    value: float | None
    #: How the value is rendered. "percent", "count", "ms" or "text".
    unit: str = "percent"
    numerator: int = 0
    denominator: int = 0
    target: float | None = None
    not_measured_reason: str | None = None
    note: str = ""

    @property
    def measured(self) -> bool:
        return self.value is not None

    @property
    def meets_target(self) -> bool | None:
        if self.target is None or self.value is None:
            return None
        return self.value >= self.target

    def display(self) -> str:
        if not self.measured:
            return "not measured"
        if self.unit == "percent":
            return (
                f"{self.value * 100:.1f}% ({self.numerator}/{self.denominator})"
                if self.denominator
                else f"{self.value * 100:.1f}%"
            )
        if self.unit == "ms":
            return f"{self.value:.0f} ms"
        if self.unit == "count":
            return str(int(self.value))
        return str(self.value)


@dataclass
class Scores:
    metrics: dict[str, MetricResult] = field(default_factory=dict)
    failures: list[str] = field(default_factory=list)

    def add(self, metric: MetricResult) -> MetricResult:
        self.metrics[metric.key] = metric
        return metric

    def get(self, key: str) -> MetricResult | None:
        return self.metrics.get(key)


def _ratio(
    key: str,
    numerator: int,
    denominator: int,
    *,
    target: float | None = None,
    note: str = "",
) -> MetricResult:
    return MetricResult(
        key=key,
        value=(numerator / denominator) if denominator else None,
        numerator=numerator,
        denominator=denominator,
        target=target,
        not_measured_reason=(
            None if denominator else "no case in the set exercised this"
        ),
        note=note,
    )


def _percentile(values: list[int], share: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(share * (len(ordered) - 1))))
    return float(ordered[index])


def score_results(results: list[CaseResult]) -> Scores:
    scores = Scores()
    answered = [r for r in results if r.behaviour == "answer"]
    errored = [r for r in results if r.behaviour == "error"]

    # -- the two purity metrics, which must be 100% --------------------------

    clean_jurisdiction = sum(
        1
        for r in answered
        if all(value == r.routed_jurisdiction for value in r.citation_jurisdictions)
    )
    scores.add(
        _ratio(
            "jurisdiction_purity",
            clean_jurisdiction,
            len(answered),
            target=1.0,
            note="Answers whose every citation comes from the jurisdiction the answer is for.",
        )
    )

    # A record can never occupy a citation slot: citations are built from chunks
    # and Record.citable_in_answers is Literal[False]. Measured anyway, because
    # a purity metric nobody measures is a claim rather than a check.
    contaminated = sum(
        1 for r in answered if any(cid.startswith("record") for cid in r.cited_document_ids)
    )
    scores.add(
        _ratio(
            "authority_purity",
            len(answered) - contaminated,
            len(answered),
            target=1.0,
            note="Answers in which no filed or granted record appeared as a citation.",
        )
    )

    # -- citations -----------------------------------------------------------

    with_citations = [r for r in answered if r.cited_document_ids]
    valid = sum(1 for r in with_citations if not r.stale_citation_ids)
    scores.add(
        _ratio(
            "citation_validity",
            valid,
            len(with_citations),
            target=1.0,
            note="Answers whose every citation resolves to a passage that is currently in force.",
        )
    )

    grounded = sum(1 for r in with_citations if not r.ungrounded_citation_ids)
    scores.add(
        _ratio(
            "citation_groundedness",
            grounded,
            len(with_citations),
            target=1.0,
            note=(
                "Answers whose every citation points at a passage actually retrieved for that "
                "question. Not the same as the citation supporting the claim, which needs a judge."
            ),
        )
    )

    wanted_citations = [r for r in results if r.case.must_cite_document_ids]
    covered = sum(
        1
        for r in wanted_citations
        if set(r.case.must_cite_document_ids) & set(r.cited_document_ids)
    )
    scores.add(
        _ratio(
            "citation_coverage",
            covered,
            len(wanted_citations),
            note=(
                "Answers citing at least one instrument the case expects. Bounded above by what "
                "has been ingested, so it reads low until the corpus is built."
            ),
        )
    )

    # -- abstention ----------------------------------------------------------

    abstained = [r for r in results if r.abstained]
    should_abstain = [r for r in results if r.case.should_abstain]

    scores.add(
        _ratio(
            "abstention_precision",
            sum(1 for r in abstained if r.case.should_abstain),
            len(abstained),
            note="Of the times it declined, how often declining was right.",
        )
    )
    scores.add(
        _ratio(
            "abstention_recall",
            sum(1 for r in should_abstain if r.abstained),
            len(should_abstain),
            target=1.0,
            note="Of the times it should have declined, how often it did.",
        )
    )

    with_reason = [
        r for r in should_abstain if r.abstained and r.case.expected_abstain_reason
    ]
    scores.add(
        _ratio(
            "abstention_reason_accuracy",
            sum(1 for r in with_reason if r.abstain_reason == r.case.expected_abstain_reason),
            len(with_reason),
            note="Declining for the reason the case expects, not merely declining.",
        )
    )

    # -- refusals ------------------------------------------------------------

    forbidden = [r for r in results if r.case.must_not_claim]
    clean = sum(
        1
        for r in forbidden
        if not any(phrase.lower() in r.answer_text.lower() for phrase in r.case.must_not_claim)
    )
    scores.add(
        _ratio(
            "forbidden_claim_avoidance",
            clean,
            len(forbidden),
            target=1.0,
            note="Answers containing none of the phrases the case forbids.",
        )
    )

    # -- classification ------------------------------------------------------

    classified = [
        r for r in answered if r.case.expected_product_class and r.product_class
    ]
    scores.add(
        _ratio(
            "classification_accuracy",
            sum(1 for r in classified if r.product_class == r.case.expected_product_class),
            len(classified),
            note="Product class on the answer matching the case, where the case sets one.",
        )
    )

    # -- language ------------------------------------------------------------

    non_english = [r for r in results if r.case.language != "en"]
    # Devanagari cannot separate Hindi from Marathi, and the detector says so
    # rather than guessing. A Marathi question detected as Hindi is the detector
    # working, so it counts as correct here and the note says why.
    shared_script = {"hi", "mr"}
    detected = sum(
        1
        for r in non_english
        if r.detected_language == r.case.language
        or (r.case.language in shared_script and r.detected_language in shared_script)
    )
    scores.add(
        _ratio(
            "language_detection_accuracy",
            detected,
            len(non_english),
            note=(
                "Script detection on the non-English cases. Devanagari cannot separate Hindi from "
                "Marathi, so either counts for either — the detector reports that ambiguity rather "
                "than guessing."
            ),
        )
    )

    # -- records regression --------------------------------------------------

    expect_records = [r for r in results if r.case.expected_related_records == "some"]
    scores.add(
        _ratio(
            "records_offered",
            sum(1 for r in expect_records if r.related_record_ids),
            len(expect_records),
            note="Cases where records were expected beside the answer and appeared.",
        )
    )

    records_with_abstention = [
        r for r in expect_records if r.case.should_abstain and r.related_record_ids
    ]
    scores.add(
        _ratio(
            "records_do_not_rescue",
            sum(1 for r in records_with_abstention if r.abstained),
            len(records_with_abstention),
            target=1.0,
            note=(
                "Cases where a record was present and the corpus should decline: the system still "
                "declined."
            ),
        )
    )

    # -- latency and errors --------------------------------------------------

    latencies = [r.latency_ms for r in results if r.behaviour != "error"]
    scores.add(
        MetricResult(
            "latency_p50",
            _percentile(latencies, 0.50) if latencies else None,
            unit="ms",
            note="Wall clock through the whole pipeline, excluding any model call latency.",
        )
    )
    scores.add(
        MetricResult(
            "latency_p95",
            _percentile(latencies, 0.95) if latencies else None,
            unit="ms",
        )
    )
    scores.add(
        MetricResult(
            "errors",
            float(len(errored)),
            unit="count",
            target=None,
            note="Cases that raised rather than answering or declining. Should be zero.",
        )
    )

    for key, reason in NOT_MEASURED.items():
        scores.add(MetricResult(key, None, not_measured_reason=reason))

    scores.failures = [
        key
        for key, metric in scores.metrics.items()
        if metric.meets_target is False
    ]
    if errored:
        scores.failures.append("errors")

    return scores
