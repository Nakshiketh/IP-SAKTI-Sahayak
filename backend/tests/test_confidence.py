"""The confidence rule, checked against the shared case set.

`evals/confidence-cases.json` is the contract between this implementation and
the TypeScript one in `frontend/src/services/confidence.ts`. Both read the same
file, so a rule the two disagree about fails here or there rather than being
discovered by a reader seeing two different confidences for the same evidence.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models.domain import Jurisdiction
from app.services.confidence import (
    RERANK_FLOOR,
    RERANK_STRONG,
    RetrievalEvidence,
    RetrievedPassage,
    score_confidence,
)

CASES_PATH = Path(__file__).resolve().parents[2] / "evals" / "confidence-cases.json"
SUITE = json.loads(CASES_PATH.read_text(encoding="utf-8"))


def evidence_for(case: dict) -> RetrievalEvidence:
    return RetrievalEvidence(
        jurisdiction=Jurisdiction.IN,
        passages=tuple(RetrievedPassage(**passage) for passage in case["passages"]),
        contradictions=tuple(tuple(pair) for pair in case["contradictions"]),
        out_of_scope=case["out_of_scope"],
        needs_more_facts=case["needs_more_facts"],
    )


def test_uses_the_thresholds_the_shared_case_set_was_written_against() -> None:
    assert SUITE["thresholds"]["rerank_floor"] == RERANK_FLOOR
    assert SUITE["thresholds"]["rerank_strong"] == RERANK_STRONG


def test_the_case_set_covers_every_level() -> None:
    levels = {case["expect"]["level"] for case in SUITE["cases"]}
    assert sorted(levels) == ["abstain", "high", "low", "moderate"]


@pytest.mark.parametrize("case", SUITE["cases"], ids=lambda case: case["name"])
def test_case(case: dict) -> None:
    result = score_confidence(evidence_for(case))
    assert result.level.value == case["expect"]["level"]
    assert result.reason_key.value == case["expect"]["reasonKey"]
    assert (result.abstain_reason.value if result.abstain_reason else None) == case["expect"][
        "abstainReason"
    ]


def test_records_are_not_an_input_to_confidence() -> None:
    """Rule 7, held structurally: the function cannot see a record.

    Not an assertion about behaviour but about the signature — there is no
    parameter through which a filed or granted record could reach this rule.
    """
    import inspect

    parameters = inspect.signature(score_confidence).parameters
    assert list(parameters) == ["evidence"]
    assert set(RetrievalEvidence.__dataclass_fields__) == {
        "jurisdiction",
        "passages",
        "contradictions",
        "out_of_scope",
        "needs_more_facts",
    }
