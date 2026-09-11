"""The records endpoints. Separate from `/query`, on purpose.

`/api/v1/query` answers what is required. These answer what has been filed. They
are different questions with different authority, and giving them different
paths is the cheapest way to keep a client from mixing them: there is no way to
ask this router for an answer and no way to ask the query router for a record.

Every response carries `citable_in_answers: false`, restated per payload rather
than documented once. A client that renders one of these as a citation has to
ignore a field to do it.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import get_records_service
from app.core.errors import ApiError
from app.models.api import (
    AggregateRow,
    LandscapeResult,
    PortalLinkRow,
    RecordDetail,
    RecordsSearchResult,
    RecordsSourceRow,
    RecordsSourcesResult,
)

router = APIRouter(prefix="/api/v1/records", tags=["records"])


@router.get("/search", response_model=RecordsSearchResult, response_model_by_alias=True)
def search(
    q: str = Query(default="", description="Words to match on title, abstract or applicant"),
    match_any: bool = Query(
        default=False,
        description=(
            "Match records containing any of the words rather than all of them. "
            "For a product described by a list of ingredients, no filing names "
            "every one, and matching all of them would find nothing."
        ),
    ),
    record_type: str | None = None,
    jurisdiction: str | None = None,
    status: str | None = None,
    filed_from: date | None = None,
    filed_to: date | None = None,
    limit: int = Query(default=20, ge=1, le=100),
) -> RecordsSearchResult:
    service = get_records_service()
    found = service.search_records(
        q,
        match_any=match_any,
        record_type=record_type,
        jurisdiction=jurisdiction,
        status=status,
        filed_from=filed_from,
        filed_to=filed_to,
        limit=limit,
    )
    state = service.status()
    return RecordsSearchResult(
        records=found,
        total=len(found),
        record_count=state.record_count,
        ingested=state.available and state.record_count > 0,
        note=(
            "Records are evidence of what was filed or granted. They are never a "
            "statement of law and never part of an answer."
        ),
    )


@router.get("/landscape", response_model=LandscapeResult, response_model_by_alias=True)
def landscape(field: str | None = None, period: str | None = None) -> LandscapeResult:
    """Aggregates, for charts.

    Its own endpoint because an aggregate can never attach to a claim about a
    specific product. A count of what an industry filed says nothing about
    whether one reader's formulation is novel, and the note says so.
    """
    rows = get_records_service().landscape(field, period)
    return LandscapeResult(
        rows=[
            AggregateRow(
                source_id=row.source_id,
                dimension=row.dimension,
                period=row.period,
                measure=row.measure,
                value=row.value,
            )
            for row in rows
        ],
        note=(
            "Counts across many filings. They describe an industry, never a "
            "particular product, and never support a claim about one."
        ),
    )


@router.get("/sources", response_model=RecordsSourcesResult, response_model_by_alias=True)
def sources(query: str | None = Query(default=None, alias="q")) -> RecordsSourcesResult:
    service = get_records_service()
    state = service.status()
    params = {"query": query} if query else None
    return RecordsSourcesResult(
        records_version=state.records_version,
        sources=[RecordsSourceRow(**row) for row in service.sources()],
        portals=[
            PortalLinkRow(
                source_id=link.source_id,
                name=link.name,
                publisher=link.publisher,
                jurisdiction=link.jurisdiction,
                record_type=link.record_type,
                url=link.url,
                terms_note=link.terms_note,
            )
            for link in service.portal_links(params)
        ],
        record_count=state.record_count,
        portal_count=state.portal_count,
        ingestible_count=state.ingestible_count,
    )


@router.get("/{record_id}", response_model=RecordDetail, response_model_by_alias=True)
def get_record(record_id: str) -> RecordDetail:
    service = get_records_service()
    record = service.get_record(record_id)
    if record is None:
        raise ApiError("unknown_record", "No such record: " + record_id, 404)

    source = service.manifest.by_id(record.source_id)
    return RecordDetail(
        record=record,
        source_name=source.name if source else record.source_id,
        publisher=source.publisher if source else None,
        attribution_text=source.attribution_text if source else None,
        licence=source.licence if source else None,
        note=(
            "Evidence of what was filed or granted. Not a statement of law, and "
            "not something an answer may cite."
        ),
    )
