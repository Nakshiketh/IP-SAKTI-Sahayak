"""The verified guidance corpus, and the answers composed from it.

The rest of the suite runs over the demo fixture (see `conftest.py`). These
tests build their own pipeline against the real knowledge-base file, because
what they check is the file and what a reader gets from it: every passage
names a document with an official URL, a procedural question is answered as
ordered steps, every sentence of an answer is a verified passage, and a
question the sources do not reach is declined.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.settings import REPO_ROOT, Settings
from app.llm.composer import GroundedComposerClient
from app.models.domain import Confidence, Jurisdiction, VerificationStatus
from app.retrieval.store import KnowledgeChunkStore, Namespaces, load_knowledge_base
from app.services.audit import AuditLog
from app.services.pipeline import Pipeline, QueryOutcome, QueryRequest, ResultEvent
from app.services.translation import build_translator

KNOWLEDGE = REPO_ROOT / "corpus" / "guidance" / "knowledge-base.json"
SOURCES = KNOWLEDGE.with_name("sources.json")


@pytest.fixture(scope="module")
def raw() -> dict:
    passages = json.loads(KNOWLEDGE.read_text(encoding="utf-8"))
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    return {**passages, "documents": sources["documents"]}


@pytest.fixture(scope="module")
def pipeline(tmp_path_factory: pytest.TempPathFactory) -> Pipeline:
    empty = tmp_path_factory.mktemp("no-index")
    settings = Settings(knowledge_base_override=KNOWLEDGE, audit_enabled=False)
    return Pipeline(
        settings=settings,
        namespaces=Namespaces(empty, settings.fixtures_dir, KNOWLEDGE),
        llm=GroundedComposerClient(KNOWLEDGE, settings.fixtures_dir),
        translator=build_translator(settings),
        audit=AuditLog(empty / "audit.sqlite3", enabled=False),
    )


def ask(pipeline: Pipeline, question: str) -> list[QueryOutcome]:
    request = QueryRequest(question=question)
    outcomes = []
    for chosen in pipeline.routes(request):
        for event in pipeline.run_route(request, chosen):
            if isinstance(event, ResultEvent):
                outcomes.append(event.outcome)
    return outcomes


# -- the file ---------------------------------------------------------------


def test_every_document_has_an_official_https_url(raw: dict) -> None:
    for document in raw["documents"]:
        assert document["source_url"].startswith("https://"), document["document_id"]
        assert document["jurisdiction"] in {"IN", "INTL"}


def test_every_chunk_names_a_known_document_and_has_text(raw: dict) -> None:
    documents = {document["document_id"] for document in raw["documents"]}
    for chunk in raw["chunks"]:
        assert chunk["document_id"] in documents, chunk["chunk_id"]
        assert len(chunk["text"]) > 40, chunk["chunk_id"]


def test_every_document_is_cited_by_some_chunk(raw: dict) -> None:
    cited = {chunk["document_id"] for chunk in raw["chunks"]}
    unused = [d["document_id"] for d in raw["documents"] if d["document_id"] not in cited]
    assert unused == []


def test_procedure_steps_are_numbered_from_one_without_gaps(raw: dict) -> None:
    knowledge = load_knowledge_base(str(KNOWLEDGE))
    for procedure_id in raw["procedures"]:
        steps = sorted({knowledge.meta[cid].step for cid in knowledge.steps(procedure_id)})
        assert steps == list(range(1, len(steps) + 1)), procedure_id
        titled = {
            knowledge.meta[cid].step
            for cid in knowledge.steps(procedure_id)
            if knowledge.meta[cid].step_title
        }
        assert titled == set(steps), procedure_id


def test_the_store_serves_verified_passages_with_their_urls() -> None:
    store = KnowledgeChunkStore(KNOWLEDGE, Jurisdiction.IN)
    chunks = store.chunks()
    assert chunks
    assert not store.is_demo and not store.is_fixture
    assert all(chunk.verification_status is VerificationStatus.VERIFIED for chunk in chunks)
    assert all(chunk.source_url and chunk.source_url.startswith("https://") for chunk in chunks)
    assert all(chunk.jurisdiction is Jurisdiction.IN for chunk in chunks)


def test_namespaces_prefer_the_knowledge_base_over_the_demo_fixture(tmp_path: Path) -> None:
    settings = Settings()
    namespaces = Namespaces(tmp_path, settings.fixtures_dir, KNOWLEDGE)
    assert namespaces.is_demo() is False
    assert namespaces.corpus_version() == load_knowledge_base(str(KNOWLEDGE)).corpus_version
    fallback = Namespaces(tmp_path, settings.fixtures_dir, tmp_path / "missing.json")
    assert fallback.is_demo() is True


# -- answers ----------------------------------------------------------------


def _claims(outcome: QueryOutcome) -> list[str]:
    assert outcome.answer is not None
    return [claim.text for block in outcome.answer.blocks for claim in block.claims]


def test_how_to_patent_is_answered_as_ordered_steps(pipeline: Pipeline) -> None:
    [outcome] = ask(pipeline, "How can I patent my Ayurveda formulation?")
    assert outcome.answer is not None and not outcome.is_demo
    steps = [text for text in _claims(outcome) if text.startswith("Step ")]
    numbers = [int(text.split()[1]) for text in steps]
    assert numbers == list(range(1, len(numbers) + 1))
    assert len(numbers) >= 10
    joined = " ".join(_claims(outcome))
    for needle in ("Form 18", "Form 2", "First Examination Report", "Form 27", "NBA"):
        assert needle in joined


def test_every_cited_claim_is_a_verified_passage_with_a_link(pipeline: Pipeline) -> None:
    knowledge = load_knowledge_base(str(KNOWLEDGE))
    texts = {row["chunk_id"]: row["text"] for _document, row in knowledge.chunks}
    [outcome] = ask(pipeline, "What do I do after filing a patent?")
    assert outcome.answer is not None
    citations = {c.citation_id: c for c in outcome.answer.citations}
    for block in outcome.answer.blocks:
        for claim in block.claims:
            for citation_id in claim.citation_ids:
                assert texts[citation_id] in claim.text
                assert citations[citation_id].url
                assert citations[citation_id].verification_status is VerificationStatus.VERIFIED


def test_after_filing_starts_at_publication(pipeline: Pipeline) -> None:
    [outcome] = ask(pipeline, "What do I do after filing a patent?")
    first = _claims(outcome)[0]
    assert first.startswith("Step 1 — Publication")


def test_a_focused_question_gets_its_step_not_the_whole_route(pipeline: Pipeline) -> None:
    [outcome] = ask(pipeline, "What documents are required for a patent application?")
    claims = _claims(outcome)
    assert not any(text.startswith("Step ") for text in claims)
    assert "Form 1" in claims[0]
    assert all("trade mark" not in text.lower() for text in claims)


@pytest.mark.parametrize(
    ("question", "needle"),
    [
        ("Where should I file a trademark?", "TM-A"),
        ("How do I register a geographical indication?", "Registrar of Geographical Indications"),
        ("How long does design registration last?", "fifteen"),
        ("How do I protect my formula as a trade secret?", "no specific statute"),
        ("Which authority should I approach for an Ayurvedic manufacturing licence?", "Form 24-D"),
        ("What is a phytopharmaceutical drug?", "four"),
        ("How is Ayurveda Aahara regulated?", "FSSAI"),
        ("Which forms do I need for NBA approval?", "Form 7"),
    ],
)
def test_scope_questions_are_answered_from_the_right_source(
    pipeline: Pipeline, question: str, needle: str
) -> None:
    outcome = ask(pipeline, question)[0]
    assert outcome.answer is not None, question
    assert needle in " ".join(_claims(outcome))


def test_international_questions_route_to_the_international_sources(pipeline: Pipeline) -> None:
    [outcome] = ask(pipeline, "How can I protect my brand in other countries?")
    assert outcome.jurisdiction is Jurisdiction.INTL
    assert "Madrid" in " ".join(_claims(outcome))


def test_a_question_the_sources_do_not_reach_is_declined(pipeline: Pipeline) -> None:
    [outcome] = ask(pipeline, "What are the dietary supplement rules in the USA?")
    assert outcome.answer is None
    assert outcome.confidence.level is Confidence.ABSTAIN
