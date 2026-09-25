"""The flagship case, and the split that made it answerable.

Two things are guarded here. That a long multi-part question is retrieved for
one part at a time, which is what took the flagship case from citing nothing to
citing thirty documents. And that the demo serves a question and never an
answer, because a demo that could serve a stored result would prove nothing
about the system a jury is being shown.

Acceptance list: docs/upgrade/FLAGSHIP_CASE.md section 5. Test id T11.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.core.settings import REPO_ROOT, Settings, get_settings
from app.llm.composer import GroundedComposerClient
from app.main import app
from app.models.domain import EscalationLevel, Jurisdiction, ProductClass
from app.reasoning.phrases import filter_text
from app.registry.store import get_registry
from app.retrieval.store import Namespaces
from app.services.audit import AuditLog
from app.services.parts import merge_parts, split_question
from app.services.pipeline import Pipeline, QueryRequest, ResultEvent
from app.services.translation import build_translator

KNOWLEDGE = REPO_ROOT / "corpus" / "guidance" / "knowledge-base.json"
CASE_PATH = REPO_ROOT / "data" / "demo" / "flagship_case.json"


@pytest.fixture(scope="module")
def case() -> dict:
    return json.loads(CASE_PATH.read_text("utf-8"))


@pytest.fixture(scope="module")
def outcomes(case: dict, tmp_path_factory) -> dict:
    tmp_path = tmp_path_factory.mktemp("flagship")
    settings = Settings(knowledge_base_override=KNOWLEDGE, audit_enabled=False)
    pipeline = Pipeline(
        settings=settings,
        namespaces=Namespaces(REPO_ROOT / "data" / "index", settings.fixtures_dir, KNOWLEDGE),
        llm=GroundedComposerClient(KNOWLEDGE, settings.fixtures_dir),
        translator=build_translator(settings),
        audit=AuditLog(tmp_path / "audit.sqlite3", enabled=False),
    )
    request = QueryRequest(question=case["question"])
    found: dict = {}
    for chosen in pipeline.routes(request):
        for event in pipeline.run_route(request, chosen):
            if isinstance(event, ResultEvent):
                found[event.outcome.jurisdiction] = event.outcome
    return found


# -- splitting ----------------------------------------------------------------


def test_a_single_question_is_one_part() -> None:
    parts = split_question("How do I request examination of a patent application?")
    assert len(parts) == 1


def test_prose_is_never_split_on_a_conjunction() -> None:
    # "and" inside one question must not become two questions scored separately.
    text = "What are the fees for filing and for requesting examination?"
    assert len(split_question(text)) == 1


def test_a_numbered_question_is_split_into_its_parts(case: dict) -> None:
    parts = split_question(case["question"])
    assert len(parts) == 7
    joined = " ".join(part.text for part in parts).lower()
    assert "biodiversity" in joined
    assert "internationally" in joined


def test_the_stem_is_kept_as_context_and_never_searched(case: dict) -> None:
    parts = split_question(case["question"])
    assert all(part.context for part in parts), "the background is kept"
    # Prefixing sixty words of background to each part is what caused the
    # dilution in the first place, so it must not appear in the searched text.
    assert all("Indian Ayurveda startup" not in part.text for part in parts)


def test_merging_keeps_the_best_score_and_remembers_which_part(case: dict) -> None:
    from app.retrieval.types import IndexedChunk, ScoredChunk

    def chunk(chunk_id: str, score: float) -> ScoredChunk:
        return ScoredChunk(
            chunk=IndexedChunk(
                chunk_id=chunk_id,
                document_id="doc",
                document_title="A document",
                organization="An authority",
                jurisdiction=Jurisdiction.IN,
                text="Some provision.",
            ),
            retrieval_score=1.0,
            rerank_score=score,
        )

    parts = split_question(case["question"])
    merged, answered = merge_parts(
        [(parts[0], [chunk("a", 0.2)]), (parts[1], [chunk("a", 0.8), chunk("b", 0.3)])]
    )
    assert [p.chunk.chunk_id for p in merged] == ["a", "b"]
    assert merged[0].rerank_score == 0.8
    assert answered["a"] == parts[1].part_id, "the part it scored best for"


# -- the acceptance list ------------------------------------------------------


def test_the_flagship_case_now_cites_real_sources(outcomes: dict) -> None:
    # Before the split, nothing cleared the retrieval floor and this cited
    # nothing at all. That regression would be invisible without this test.
    india = outcomes[Jurisdiction.IN]
    assert india.answer is not None, "the India analysis must answer, not abstain"
    assert len(india.answer.citations) >= 10
    known = set(get_registry().all())
    assert {c.document_id for c in india.answer.citations} <= known or not known


def test_india_and_international_are_separate_analyses(outcomes: dict) -> None:
    assert set(outcomes) == {Jurisdiction.IN, Jurisdiction.INTL}
    for jurisdiction, outcome in outcomes.items():
        cited = {c.jurisdiction for c in (outcome.answer.citations if outcome.answer else [])}
        assert cited <= {jurisdiction}


def test_at_least_two_classification_candidates_are_offered(outcomes: dict) -> None:
    analysis = outcomes[Jurisdiction.IN].analysis
    candidates = [analysis.product_class, *analysis.alternative_classes]
    named = [c for c in candidates if c is not ProductClass.UNDETERMINED]
    assert len(named) >= 2
    assert analysis.missing_facts, "and the facts that would choose between them"


def test_a_conflict_resolves_as_separate_obligations(outcomes: dict) -> None:
    for outcome in outcomes.values():
        statuses = {c.resolution_status.value for c in outcome.analysis.conflicts}
        assert "separate_obligations" in statuses


def test_every_jurisdictional_conflict_names_registered_sources(outcomes: dict) -> None:
    known = set(get_registry().all())
    if not known:
        pytest.skip("no registry built on this machine")
    for outcome in outcomes.values():
        for conflict in outcome.analysis.conflicts:
            if conflict.conflict_type.value != "jurisdictional":
                continue
            assert conflict.source_a in known
            assert conflict.source_b in known


def test_escalation_is_at_least_l2(outcomes: dict) -> None:
    for outcome in outcomes.values():
        assert outcome.analysis.escalation.level in {EscalationLevel.L2, EscalationLevel.L3}


def test_no_blocked_verdict_phrase_reaches_the_answer(outcomes: dict) -> None:
    for outcome in outcomes.values():
        if outcome.answer is None:
            continue
        for block in outcome.answer.blocks:
            for claim in block.claims:
                assert filter_text(claim.text).blocked is False


def test_the_answer_carries_its_corpus_version(outcomes: dict) -> None:
    for outcome in outcomes.values():
        if outcome.answer is not None:
            assert outcome.answer.corpus_version


# -- T11: the demo serves a question, never an answer -------------------------


def test_the_seeded_case_holds_no_answer(case: dict) -> None:
    assert set(case) == {"id", "language", "question"}
    assert "answer" not in case


def test_the_demo_endpoint_is_off_unless_the_flag_is_on(monkeypatch) -> None:
    # The flag now ships on, so this sets it false rather than relying on the
    # default. The guarantee under test is the one that matters either way: the
    # flag genuinely gates the route, so turning it off removes the endpoint
    # rather than merely hiding the button that calls it.
    monkeypatch.setenv("SAHAYAK_FEATURE_JURY_DEMO", "false")
    get_settings.cache_clear()
    try:
        assert TestClient(app).get("/api/v1/demo/flagship-case").status_code == 404
    finally:
        get_settings.cache_clear()


def test_the_demo_endpoint_is_on_by_default() -> None:
    # And the default is now on, which is the other half: a finished feature
    # left switched off is indistinguishable from one that was never built.
    get_settings.cache_clear()
    try:
        assert TestClient(app).get("/api/v1/demo/flagship-case").status_code == 200
    finally:
        get_settings.cache_clear()


def test_the_demo_endpoint_returns_only_the_question(monkeypatch) -> None:
    monkeypatch.setenv("SAHAYAK_FEATURE_JURY_DEMO", "true")
    get_settings.cache_clear()
    try:
        body = TestClient(app).get("/api/v1/demo/flagship-case").json()
        assert set(body) == {"id", "language", "question"}
        assert "Ashwagandha" in body["question"]
    finally:
        get_settings.cache_clear()
