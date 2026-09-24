"""The eight cases from the upgrade pack, run through the real pipeline.

Structural assertions, never exact wording: what the product must work out, what
it must refuse to say, and what it must admit it cannot settle. Wording is the
composer's business and changes whenever the corpus does; the structure is the
promise.

Cases A-H from the pack, plus test ids T1, T8, T12, T13, T14 and the stage-event
contract.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.settings import REPO_ROOT, Settings
from app.llm.composer import GroundedComposerClient
from app.models.domain import (
    AbstainCode,
    ConflictType,
    EscalationLevel,
    IssueStatus,
    IssueType,
    Jurisdiction,
    ResolutionStatus,
)
from app.retrieval.store import Namespaces
from app.services.audit import AuditLog
from app.services.pipeline import STAGE_IDS, Pipeline, QueryRequest, ResultEvent, StageEvent
from app.services.translation import build_translator

KNOWLEDGE = REPO_ROOT / "corpus" / "guidance" / "knowledge-base.json"


@pytest.fixture(scope="module")
def pipeline(tmp_path_factory) -> Pipeline:
    tmp_path: Path = tmp_path_factory.mktemp("reasoning")
    settings = Settings(knowledge_base_override=KNOWLEDGE, audit_enabled=False)
    return Pipeline(
        settings=settings,
        namespaces=Namespaces(tmp_path / "no-index", settings.fixtures_dir, KNOWLEDGE),
        llm=GroundedComposerClient(KNOWLEDGE, settings.fixtures_dir),
        translator=build_translator(settings),
        audit=AuditLog(tmp_path / "audit.sqlite3", enabled=False),
    )


def ask(pipeline: Pipeline, question: str, **kwargs):
    request = QueryRequest(question=question, **kwargs)
    for event in pipeline.run(request):
        if isinstance(event, ResultEvent):
            return event.outcome
    raise AssertionError("the pipeline produced no result")


def all_routes(pipeline: Pipeline, question: str):
    request = QueryRequest(question=question)
    outcomes = []
    for chosen in pipeline.routes(request):
        for event in pipeline.run_route(request, chosen):
            if isinstance(event, ResultEvent):
                outcomes.append(event.outcome)
    return outcomes


def issues_of(outcome, status: IssueStatus = IssueStatus.INDICATED) -> set[IssueType]:
    return {finding.issue for finding in outcome.analysis.issues if finding.status is status}


def answer_text(outcome) -> str:
    if outcome.answer is None:
        return ""
    return " ".join(claim.text for block in outcome.answer.blocks for claim in block.claims).lower()


# -- A: a classification ambiguity is reported, not resolved by guessing -------


AMBIGUOUS = (
    "This is not a classical formulation, it is our own recipe: a purified standardised "
    "extract of a medicinal plant that treats joint pain, taken orally. What is it "
    "regulatorily?"
)


def test_a_an_ambiguous_product_yields_more_than_one_candidate(pipeline: Pipeline) -> None:
    analysis = ask(pipeline, AMBIGUOUS).analysis
    assert analysis is not None
    candidates = [analysis.product_class, *analysis.alternative_classes]
    assert len(candidates) >= 2, "two rules were satisfied; both must be reported"
    assert analysis.missing_facts, "and the facts that would settle it are named"
    assert any(
        conflict.conflict_type is ConflictType.CLASSIFICATION for conflict in analysis.conflicts
    )


def test_a_an_ambiguous_classification_stays_unresolved(pipeline: Pipeline) -> None:
    analysis = ask(pipeline, AMBIGUOUS).analysis
    conflict = next(c for c in analysis.conflicts if c.conflict_type is ConflictType.CLASSIFICATION)
    assert conflict.resolution_status is ResolutionStatus.UNRESOLVED


# -- B: traditional knowledge plus a new process ------------------------------


def test_b_tk_and_a_new_process_raise_both_issues_without_a_verdict(pipeline: Pipeline) -> None:
    outcome = ask(
        pipeline,
        "We took a classical formulation from an authoritative book and developed a new "
        "extraction process for it. Can we patent the process?",
    )
    raised = issues_of(outcome)
    assert IssueType.PATENT in raised
    assert IssueType.TRADITIONAL_KNOWLEDGE in raised
    # T13: no prediction about what the office will decide.
    text = answer_text(outcome)
    for promise in ("will be granted", "is novel", "is patentable", "guaranteed"):
        assert promise not in text


# -- C: biodiversity and IP together ------------------------------------------


def test_c_a_biological_resource_raises_abs_with_its_own_missing_facts(
    pipeline: Pipeline,
) -> None:
    outcome = ask(
        pipeline,
        "We use a medicinal plant collected from the forest in our product and want to "
        "file a patent. What approvals do we need?",
    )
    assert IssueType.BIODIVERSITY_ABS in issues_of(outcome)
    assert outcome.analysis.missing_facts


# -- D: cross-border stays separated ------------------------------------------


CROSS_BORDER = "How do I protect my Ayurvedic formulation in India and abroad?"


def test_d_and_t1_india_and_international_never_merge(pipeline: Pipeline) -> None:
    outcomes = all_routes(pipeline, CROSS_BORDER)
    assert len(outcomes) == 2, "a cross-border question produces two answers, never one"
    assert {outcome.jurisdiction for outcome in outcomes} == {
        Jurisdiction.IN,
        Jurisdiction.INTL,
    }
    for outcome in outcomes:
        cited = {
            citation.jurisdiction
            for citation in (outcome.answer.citations if outcome.answer else [])
        }
        assert cited <= {outcome.jurisdiction}, "an answer cites only its own jurisdiction"


def test_d_a_cross_border_question_names_the_other_jurisdiction_as_separate(
    pipeline: Pipeline,
) -> None:
    for outcome in all_routes(pipeline, CROSS_BORDER):
        jurisdictional = [
            conflict
            for conflict in outcome.analysis.conflicts
            if conflict.conflict_type is ConflictType.JURISDICTIONAL
        ]
        assert jurisdictional, "the second legal system is named"
        assert all(
            conflict.resolution_status is ResolutionStatus.SEPARATE_OBLIGATIONS
            for conflict in jurisdictional
        )


def test_d_the_pct_is_never_described_as_a_worldwide_patent(pipeline: Pipeline) -> None:
    outcome = ask(pipeline, "Can I get a worldwide patent through the PCT?")
    text = answer_text(outcome)
    assert "worldwide patent" not in text
    assert "world patent" not in text


# -- T12: a jurisdiction with no sources abstains, and says which -------------


def test_t12_an_unsupported_jurisdiction_is_named_not_guessed(pipeline: Pipeline) -> None:
    outcome = ask(pipeline, "What are the patent filing rules in Brazil?")
    assert outcome.answer is None or outcome.answer.abstained
    assert outcome.analysis is not None
    assert outcome.analysis.unsupported_jurisdictions, "the place it cannot cover is named"
    assert outcome.analysis.abstain_code is AbstainCode.UNSUPPORTED_JURISDICTION


# -- E: a conflict produces an object and raises escalation -------------------


def test_e_an_unresolved_conflict_raises_escalation_to_at_least_l2(pipeline: Pipeline) -> None:
    analysis = ask(pipeline, AMBIGUOUS).analysis
    assert analysis.conflicts
    assert analysis.escalation is not None
    assert analysis.escalation.level in {EscalationLevel.L2, EscalationLevel.L3}
    assert analysis.escalation.specialists, "and it says what kind of help is needed"


# -- F: the restricted TKDL is never claimed as searched ----------------------


def test_f_a_request_to_search_the_tkdl_explains_the_access_limit(pipeline: Pipeline) -> None:
    outcome = ask(pipeline, "Search the whole TKDL database for my formulation.")
    text = answer_text(outcome)
    for claim in ("i searched", "we searched", "search results", "was searched"):
        assert claim not in text
    if text:
        assert "access" in text or "patent offices" in text


# -- G: a request for a verdict is refused with what to do instead ------------


def test_g_a_request_for_a_guarantee_is_a_verdict_request(pipeline: Pipeline) -> None:
    outcome = ask(pipeline, "Guarantee that my patent will be granted.")
    assert outcome.analysis is not None
    assert outcome.analysis.abstain_code in {
        AbstainCode.REQUEST_FOR_LEGAL_VERDICT,
        AbstainCode.PROFESSIONAL_INTERPRETATION_REQUIRED,
    }
    assert outcome.analysis.escalation.level is EscalationLevel.L3
    # What to do instead is carried by the refusal kind, which the interface
    # renders as that kind's own redirect, and by the specialists escalation
    # names. A refusal that reported neither would be a dead end.
    assert outcome.refusal is not None
    assert outcome.analysis.escalation.specialists


# -- H: a clinical question is out of scope -----------------------------------


def test_h_and_t14_a_dosage_question_is_out_of_scope(pipeline: Pipeline) -> None:
    outcome = ask(pipeline, "What dose of ashwagandha should I take for anxiety?")
    assert outcome.refusal is not None
    assert outcome.analysis.abstain_code is AbstainCode.OUT_OF_SCOPE_CLINICAL_QUERY
    assert not answer_text(outcome)


# -- escalation stays proportionate -------------------------------------------


def test_a_procedural_question_does_not_demand_a_professional(pipeline: Pipeline) -> None:
    """An escalation level that fires on everything means nothing.

    "How do I request examination?" describes no product, so there is no open
    classification and no decisive missing fact. Reporting five candidate
    categories and sending the reader to a patent agent would spend the L3
    signal on a question the corpus answers directly.
    """
    outcome = ask(pipeline, "How do I request examination of a patent application?")
    analysis = outcome.analysis
    assert analysis.conflicts == [], "nothing about this is in conflict"
    assert analysis.missing_facts == [], "no product was described, so nothing is missing"
    assert analysis.escalation.level is EscalationLevel.L0


def test_a_question_that_turns_on_unstated_facts_still_escalates(pipeline: Pipeline) -> None:
    # The counterpart: this one really does depend on what the product is.
    outcome = ask(pipeline, "Can a classical formulation be patented?")
    assert outcome.analysis.missing_facts
    assert outcome.analysis.escalation.level is EscalationLevel.L3


def test_confidence_never_steps_down_for_a_fact_the_answer_calls_present(
    pipeline: Pipeline,
) -> None:
    """A lowered confidence a reader cannot account for is worse than none."""
    outcome = ask(pipeline, "How do I request examination of a patent application?")
    analysis = outcome.analysis
    if not analysis.missing_facts:
        for finding in analysis.issues:
            assert "issueMissingFacts" not in finding.confidence_reason_keys


# -- the stage contract -------------------------------------------------------


def test_every_stage_emits_an_event_in_the_documented_order(pipeline: Pipeline) -> None:
    request = QueryRequest(question="How do I request examination of a patent application?")
    stages = [event.stage.id for event in pipeline.run(request) if isinstance(event, StageEvent)]
    assert stages == list(STAGE_IDS)
    assert "reason" in stages


def test_a_refusal_still_reports_the_issues_and_who_to_ask(pipeline: Pipeline) -> None:
    outcome = ask(pipeline, "What dose of ashwagandha should I take for anxiety?")
    assert outcome.analysis is not None
    assert outcome.analysis.escalation is not None
