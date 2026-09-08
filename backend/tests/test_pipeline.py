"""The pipeline, end to end, over the demo fixture.

These are the tests that would catch a stage being wired in the wrong order, or
a rule holding in isolation and not in the run. The demo store is used
deliberately: it is what an unconfigured install serves, so this is the path a
reader actually gets.

Two properties are asserted in several different ways on purpose, because they
are the two the product cannot be wrong about: an answer never mixes
jurisdictions, and every claim in an answer points at a passage that was really
retrieved.
"""

from __future__ import annotations

import pytest

from app.core.errors import GenerationUnavailable
from app.core.settings import Settings
from app.llm.fixture import FixtureLLMClient
from app.llm.types import GenerationRequest
from app.models.domain import Confidence, Jurisdiction, ProductClass, VerificationStatus
from app.retrieval.store import Namespaces
from app.services.context import Context
from app.services.pipeline import (
    STAGE_IDS,
    Pipeline,
    QueryRequest,
    ResultEvent,
    RetrievedEvent,
    StageEvent,
)
from app.services.translation import PassthroughTranslator

# Questions chosen so each lands on a different outcome. They are the demo path;
# a change that moves one of them is a change to what a reader sees.
ANSWERED = "What do we need in place before manufacturing an Ayurvedic product in India?"
REFUSED = "How much of this should a patient take each day?"
NOTHING = "What are the patent rules in Brazil?"
STALE = "Is that notification superseded or is it still current?"
CONFLICT = "What stability and shelf life information goes on the pack?"
NEEDS_FACTS = "Is our product a medicine, a nutraceutical or a cosmetic?"


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(audit_db_path=str(tmp_path / "audit.sqlite3"), audit_enabled=False)


@pytest.fixture
def pipeline(settings: Settings) -> Pipeline:
    return Pipeline(
        settings=settings,
        namespaces=Namespaces(settings.index_dir, settings.fixtures_dir),
        llm=FixtureLLMClient(settings.fixtures_dir),
        translator=PassthroughTranslator(),
    )


def run(pipeline: Pipeline, question: str, jurisdiction=Jurisdiction.IN, **kwargs):
    request = QueryRequest(question=question, jurisdiction=jurisdiction, **kwargs)
    chosen = pipeline.routes(request)[0]
    return list(pipeline.run_route(request, chosen))


def outcome(events):
    return next(e.outcome for e in events if isinstance(e, ResultEvent))


# -- the shape of a run ------------------------------------------------------


def test_the_stages_run_in_the_documented_order(pipeline: Pipeline) -> None:
    stages = [e.stage.id for e in run(pipeline, ANSWERED) if isinstance(e, StageEvent)]
    assert stages == list(STAGE_IDS)


def test_the_retrieved_count_arrives_before_the_result(pipeline: Pipeline) -> None:
    events = run(pipeline, ANSWERED)
    kinds = [type(event) for event in events]
    assert kinds.index(RetrievedEvent) < kinds.index(ResultEvent)


def test_the_timings_reported_are_the_ones_the_stages_took(pipeline: Pipeline) -> None:
    result = outcome(run(pipeline, ANSWERED))
    assert sum(stage.ms for stage in result.stages) <= result.total_ms + 5
    assert all(stage.ms >= 0 for stage in result.stages)


# -- answering ---------------------------------------------------------------


def test_an_answered_question_produces_a_cited_answer(pipeline: Pipeline) -> None:
    result = outcome(run(pipeline, ANSWERED))
    assert result.answer is not None
    assert result.confidence.level is not Confidence.ABSTAIN
    assert result.answer.citations
    assert [block.kind.value for block in result.answer.blocks][0] == "answer"


def test_every_claim_points_at_a_passage_that_was_retrieved(pipeline: Pipeline) -> None:
    result = outcome(run(pipeline, ANSWERED))
    assert result.answer is not None
    retrieved = {passage.citation_id for passage in result.evidence.passages}
    for block in result.answer.blocks:
        for claim in block.claims:
            for citation_id in claim.citation_ids:
                assert citation_id in retrieved


def test_no_claim_cites_a_passage_that_did_not_clear_the_floor(pipeline: Pipeline) -> None:
    from app.services.confidence import RERANK_FLOOR

    result = outcome(run(pipeline, ANSWERED))
    assert result.answer is not None
    scores = {p.citation_id: p.rerank_score for p in result.evidence.passages}
    for citation in result.answer.citations:
        assert scores[citation.citation_id] >= RERANK_FLOOR


def test_a_demo_answer_is_marked_demo_everywhere_it_could_be_read(
    pipeline: Pipeline,
) -> None:
    result = outcome(run(pipeline, ANSWERED))
    assert result.answer is not None
    assert result.answer.is_demo is True
    assert result.is_demo is True
    assert all(
        citation.verification_status is VerificationStatus.DEMO
        for citation in result.answer.citations
    )


def test_an_answer_carries_the_corpus_version_it_relied_on(pipeline: Pipeline) -> None:
    result = outcome(run(pipeline, ANSWERED))
    assert result.answer is not None
    assert result.answer.corpus_version == "0.0.0-demo"
    assert result.answer.as_of_date is not None


# -- abstaining --------------------------------------------------------------


@pytest.mark.parametrize(
    ("question", "reason"),
    [
        (REFUSED, "out_of_scope"),
        (NOTHING, "nothing_relevant"),
        (STALE, "sources_out_of_date"),
        (CONFLICT, "sources_conflict"),
        (NEEDS_FACTS, "needs_more_facts"),
    ],
)
def test_each_abstention_is_reachable_end_to_end(
    pipeline: Pipeline, question: str, reason: str
) -> None:
    result = outcome(
        run(pipeline, question, Jurisdiction.INTL if "Brazil" in question else Jurisdiction.IN)
    )
    assert result.answer is None
    assert result.confidence.level is Confidence.ABSTAIN
    assert result.confidence.abstain_reason is not None
    assert result.confidence.abstain_reason.value == reason


def test_a_refusal_short_circuits_before_retrieval(pipeline: Pipeline) -> None:
    """Whether a dosage question is refused cannot depend on the corpus."""
    events = run(pipeline, REFUSED)
    stages = [e.stage.id for e in events if isinstance(e, StageEvent)]
    assert stages == ["detect", "understand"]
    assert outcome(events).evidence.passages == ()


def test_an_abstention_still_carries_the_evidence_it_abstained_on(
    pipeline: Pipeline,
) -> None:
    result = outcome(run(pipeline, STALE))
    assert result.answer is None
    assert result.evidence.passages, "the reader has to be able to see what was found"


def test_records_appear_beside_an_abstention_and_change_nothing(
    pipeline: Pipeline,
) -> None:
    with_records = outcome(run(pipeline, "What prior art records exist for this formulation?"))
    assert with_records.related_records
    # Whatever the records say, the confidence came from the passages alone.
    assert all(record.citable_in_answers is False for record in with_records.related_records)


# -- jurisdiction ------------------------------------------------------------


def test_a_cross_border_question_produces_two_answers_never_one(pipeline: Pipeline) -> None:
    request = QueryRequest(
        question=(
            "We have modified a classical polyherbal formulation and want to sell "
            "it in India and the UK. What should we work out first?"
        )
    )
    routes = pipeline.routes(request)
    assert len(routes) == 2

    outcomes = [outcome(list(pipeline.run_route(request, chosen))) for chosen in routes]
    assert {o.jurisdiction for o in outcomes} == {Jurisdiction.IN, Jurisdiction.INTL}
    for result in outcomes:
        if result.answer is None:
            continue
        assert all(
            citation.jurisdiction is result.jurisdiction for citation in result.answer.citations
        )


def test_an_answer_never_cites_the_other_jurisdiction(pipeline: Pipeline) -> None:
    for jurisdiction in Jurisdiction:
        result = outcome(run(pipeline, "What has to be on the label?", jurisdiction))
        if result.answer is None:
            continue
        for citation in result.answer.citations:
            assert citation.jurisdiction is jurisdiction


def test_the_two_jurisdictions_give_visibly_different_answers(pipeline: Pipeline) -> None:
    # Deliberately names no jurisdiction, so the toggle is what decides and the
    # two runs are comparable.
    question = "What do we need before we can sell this product?"
    india = outcome(run(pipeline, question, Jurisdiction.IN))
    elsewhere = outcome(run(pipeline, question, Jurisdiction.INTL))
    india_documents = {c.document_id for c in (india.answer.citations if india.answer else [])}
    other_documents = {
        c.document_id for c in (elsewhere.answer.citations if elsewhere.answer else [])
    }
    assert india_documents and other_documents
    assert india_documents.isdisjoint(other_documents)


# -- the fixture generator's own rule ----------------------------------------


def test_the_fixture_generator_refuses_to_write_over_a_real_passage(
    settings: Settings,
) -> None:
    client = FixtureLLMClient(settings.fixtures_dir)
    request = GenerationRequest(
        question="anything",
        jurisdiction=Jurisdiction.IN,
        context=Context(
            passages=(), prompt_text="", tokens_used=0, dropped=(), neutralised_spans=0
        ),
        all_passages_are_demo=False,
    )
    with pytest.raises(GenerationUnavailable):
        client.generate(request)


def test_a_product_class_the_reader_gave_is_not_overwritten(pipeline: Pipeline) -> None:
    result = outcome(run(pipeline, ANSWERED, product_class=ProductClass.PHYTOPHARMACEUTICAL))
    assert result.answer is not None
    assert result.answer.product_class is ProductClass.PHYTOPHARMACEUTICAL
