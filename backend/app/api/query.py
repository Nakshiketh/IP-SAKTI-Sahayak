"""The query endpoint. Streams, because the work is worth watching.

The response is newline-delimited JSON rather than server-sent events. Both
would work; NDJSON was chosen because the client is a fetch reader rather than
an `EventSource` — `EventSource` cannot issue a POST, and the question does not
belong in a URL.

Three event types go down the wire:

    {"event":"stage","id":"retrieve","ms":41}
    {"event":"retrieved","passages":3,"documents":2}
    {"event":"result", ...}

`retrieved` exists so the interface's second status line — "reading N passages
from M documents" — is a real count as soon as it is known, rather than a
number that appears with the finished answer. An error arrives as an event too
when the stream has already started, because HTTP status is long gone by then.

A cross-border question emits two `result` events, one per jurisdiction, and
they are never merged.
"""

from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import enforce_rate_limit, get_pipeline, session_header
from app.core.errors import ApiError
from app.core.settings import get_settings
from app.models.api import (
    QueryBody,
    WireConfidence,
    WireDetection,
    WireEvidence,
    WirePassage,
    WireQueryResult,
    WireRoute,
    WireStage,
    WireTranslation,
)
from app.services.pipeline import (
    Pipeline,
    QueryOutcome,
    QueryRequest,
    ResultEvent,
    RetrievedEvent,
    StageEvent,
)

router = APIRouter(prefix="/api/v1", tags=["query"])


def to_wire(outcome: QueryOutcome) -> WireQueryResult:
    confidence = outcome.confidence
    return WireQueryResult(
        query_id=outcome.query_id,
        question=outcome.question,
        jurisdiction=outcome.jurisdiction,
        evidence=WireEvidence(
            jurisdiction=outcome.evidence.jurisdiction,
            passages=[
                WirePassage(
                    citation_id=passage.citation_id,
                    document_id=passage.document_id,
                    retrieval_score=passage.retrieval_score,
                    rerank_score=passage.rerank_score,
                    within_effective_window=passage.within_effective_window,
                )
                for passage in outcome.evidence.passages
            ],
            contradictions=[tuple(pair) for pair in outcome.evidence.contradictions],
            out_of_scope=outcome.evidence.out_of_scope,
            needs_more_facts=outcome.evidence.needs_more_facts,
        ),
        confidence=WireConfidence(
            level=confidence.level,
            reason_key=confidence.reason_key.value,
            reason_vars=confidence.reason_vars,
            abstain_reason=confidence.abstain_reason,
        ),
        answer=outcome.answer,
        related_records=list(outcome.related_records),
        follow_ups=list(outcome.follow_ups),
        stages=[WireStage(id=stage.id, ms=stage.ms) for stage in outcome.stages],
        total_ms=outcome.total_ms,
        documents_searched=outcome.documents_searched,
        sources=dict(outcome.sources),
        passages=dict(outcome.passage_text),
        language=WireDetection(
            language=outcome.detection.language,
            confidence=outcome.detection.confidence,
            ambiguous_with=list(outcome.detection.ambiguous_with),
            decided=outcome.detection.decided,
        ),
        route=WireRoute(
            jurisdiction=outcome.jurisdiction,
            inferred=outcome.route_inferred,
            marker=outcome.route_marker,
        ),
        corpus_version=outcome.corpus_version,
        is_demo=outcome.is_demo,
        translation=WireTranslation(engine=outcome.translator, translated=outcome.translated),
        refusal=outcome.refusal.kind.value if outcome.refusal else None,
    )


def _line(payload: dict) -> str:
    return json.dumps(payload, default=str, ensure_ascii=False) + "\n"


def _stream(pipeline: Pipeline, request: QueryRequest) -> Iterator[str]:
    try:
        for chosen in pipeline.routes(request):
            for event in pipeline.run_route(request, chosen):
                if isinstance(event, StageEvent):
                    yield _line({"event": "stage", "id": event.stage.id, "ms": event.stage.ms})
                elif isinstance(event, RetrievedEvent):
                    yield _line(
                        {
                            "event": "retrieved",
                            "passages": event.passages,
                            "documents": event.documents,
                        }
                    )
                elif isinstance(event, ResultEvent):
                    body = to_wire(event.outcome).model_dump(mode="json", by_alias=True)
                    yield _line({"event": "result", **body})
    except ApiError as error:
        # The status line went out with the first byte. An error this late has
        # to travel as an event, and the client renders it as a failure rather
        # than as an answer that never arrived.
        yield _line({"event": "error", "code": error.code, "message": error.message})


@router.post("/query")
def query(body: QueryBody, session_id: str = Depends(session_header)) -> StreamingResponse:
    settings = get_settings()
    session = body.session_id if body.session_id != "anonymous" else session_id
    enforce_rate_limit(session)

    text = body.text.strip()
    if not text:
        raise ApiError("empty_question", "No question was sent.", status_code=422)
    if len(text) > settings.max_question_chars:
        raise ApiError(
            "question_too_long",
            "A question may be at most " + str(settings.max_question_chars) + " characters.",
            status_code=422,
        )

    filters = body.filters
    request = QueryRequest(
        question=text,
        jurisdiction=body.jurisdiction,
        language_in=body.language_in,
        language_out=body.language_out,
        product_class=body.product_class,
        session_id=session,
        ip_rights=tuple(filters.ip_rights) if filters else (),
        regulatory_areas=tuple(filters.regulatory_areas) if filters else (),
        document_types=tuple(filters.document_types) if filters else (),
    )

    return StreamingResponse(
        _stream(get_pipeline(), request),
        media_type="application/x-ndjson",
        # The stream is useless if something buffers it into one write.
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
