"""Running the gold set through the real pipeline.

Through the pipeline rather than through the API, because what is being measured
is the product's behaviour rather than its HTTP surface, and because a run of a
hundred and seventy questions should not need a server. Everything below the
pipeline is real: the same retriever, the same generator, the same confidence
rule, the same records service.

One thing is deliberately not real, and it is worth being clear about. The run
uses whatever corpus is built on the machine. Today that is a demonstration
fixture of a handful of illustrative documents, so most questions abstain for
want of anything to answer from. That is a fact about the corpus, not about the
pipeline, and the report says so before it says anything else.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

from app.core.settings import Settings
from app.evals.cases import GoldCase, GoldSet
from app.llm.registry import build_llm_client
from app.models.domain import Answer, Jurisdiction
from app.records.store import RecordsStore
from app.retrieval.store import Namespaces
from app.services.pipeline import Pipeline, QueryRequest, ResultEvent
from app.services.records_service import RecordsService
from app.services.translation import build_translator


@dataclass
class CaseResult:
    case: GoldCase
    #: What the pipeline did: "answer" or "abstain".
    behaviour: str
    abstain_reason: str | None
    confidence: str
    product_class: str | None
    ip_rights: tuple[str, ...]
    regulatory_areas: tuple[str, ...]
    cited_document_ids: tuple[str, ...]
    citation_jurisdictions: tuple[str, ...]
    #: Citation ids that were not among the passages actually retrieved.
    ungrounded_citation_ids: tuple[str, ...]
    #: Citation ids whose passage is outside its effective window.
    stale_citation_ids: tuple[str, ...]
    related_record_ids: tuple[str, ...]
    detected_language: str
    answer_text: str
    latency_ms: int
    routed_jurisdiction: str
    refusal: str | None = None
    error: str | None = None
    notes: list[str] = field(default_factory=list)

    @property
    def abstained(self) -> bool:
        return self.behaviour == "abstain"


@dataclass
class RunContext:
    """What the run was measured against, recorded on the report."""

    corpus_version: str
    corpus_documents: int
    corpus_is_demo: bool
    records_available: bool
    records_count: int
    generator: str
    translator: str


def build_pipeline(settings: Settings) -> tuple[Pipeline, RunContext]:
    namespaces = Namespaces(settings.index_dir, settings.fixtures_dir)
    records = RecordsService(RecordsStore(settings.records_db_path), settings.records_manifest_path)
    llm = build_llm_client(settings)
    translator = build_translator(settings)

    pipeline = Pipeline(
        settings=settings,
        namespaces=namespaces,
        llm=llm,
        translator=translator,
        records=records,
    )
    status = records.status()
    context = RunContext(
        corpus_version=namespaces.corpus_version(),
        corpus_documents=namespaces.document_count(),
        corpus_is_demo=namespaces.is_demo(),
        records_available=status.available,
        records_count=status.record_count,
        generator=llm.name,
        translator=translator.name,
    )
    return pipeline, context


def _answer_text(answer: Answer | None) -> str:
    return " ".join(block.text for block in answer.blocks) if answer else ""


def run_case(pipeline: Pipeline, case: GoldCase) -> CaseResult:
    request = QueryRequest(
        question=case.question,
        jurisdiction=Jurisdiction(case.jurisdiction),
        product_class=(
            __import__("app.models.domain", fromlist=["ProductClass"]).ProductClass.UNDETERMINED
        ),
        session_id="evals",
    )

    started = time.perf_counter()
    try:
        chosen = pipeline.routes(request)[0]
        outcome = next(
            event.outcome
            for event in pipeline.run_route(request, chosen)
            if isinstance(event, ResultEvent)
        )
    except Exception as error:  # noqa: BLE001 - a failing case is a result, not a crash
        return CaseResult(
            case=case,
            behaviour="error",
            abstain_reason=None,
            confidence="",
            product_class=None,
            ip_rights=(),
            regulatory_areas=(),
            cited_document_ids=(),
            citation_jurisdictions=(),
            ungrounded_citation_ids=(),
            stale_citation_ids=(),
            related_record_ids=(),
            detected_language="",
            answer_text="",
            latency_ms=int((time.perf_counter() - started) * 1000),
            routed_jurisdiction=case.jurisdiction,
            error=type(error).__name__ + ": " + str(error),
        )

    answer = outcome.answer
    retrieved = {passage.citation_id for passage in outcome.evidence.passages}
    in_window = {
        passage.citation_id
        for passage in outcome.evidence.passages
        if passage.within_effective_window
    }
    citations = list(answer.citations) if answer else []

    return CaseResult(
        case=case,
        behaviour="abstain" if answer is None else "answer",
        abstain_reason=(
            outcome.confidence.abstain_reason.value if outcome.confidence.abstain_reason else None
        ),
        confidence=outcome.confidence.level.value,
        product_class=answer.product_class.value if answer else None,
        ip_rights=tuple(right.value for right in (answer.ip_rights if answer else [])),
        regulatory_areas=tuple(area.value for area in (answer.regulatory_areas if answer else [])),
        cited_document_ids=tuple(citation.document_id for citation in citations),
        citation_jurisdictions=tuple(citation.jurisdiction.value for citation in citations),
        ungrounded_citation_ids=tuple(
            citation.citation_id for citation in citations if citation.citation_id not in retrieved
        ),
        stale_citation_ids=tuple(
            citation.citation_id for citation in citations if citation.citation_id not in in_window
        ),
        related_record_ids=tuple(record.record_id for record in outcome.related_records),
        detected_language=outcome.detection.language if outcome.detection.decided else "",
        answer_text=_answer_text(answer),
        latency_ms=outcome.total_ms,
        routed_jurisdiction=outcome.jurisdiction.value,
        refusal=outcome.refusal.kind.value if outcome.refusal else None,
    )


def run_gold(
    gold: GoldSet, settings: Settings | None = None
) -> tuple[list[CaseResult], RunContext]:
    pipeline, context = build_pipeline(settings or Settings())
    return [run_case(pipeline, case) for case in gold.cases], context


def default_gold_dir(repo_root: Path) -> Path:
    return repo_root / "evals" / "gold"
