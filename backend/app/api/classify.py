"""Classification and access-and-benefit-sharing orientation.

Both walk a decision graph and both stop at the same line: they say what the
product is, or where the reader stands, and nothing about what follows from it.
What follows is a statement about law, and statements about law come from
retrieved passages, not from a lookup table shipped with the code.

The classification graph is `app/services/classification/graph.json` — the same
file the frontend reads, so the flow a reader walks in the browser and the flow
this endpoint walks cannot drift apart.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import enforce_rate_limit, session_header
from app.core.errors import ApiError
from app.models.api import AbsBody, AbsResult, ClassifyBody, ClassifyResult
from app.models.domain import ProductClass
from app.services.classification import classify, load_graph, longest_path

router = APIRouter(prefix="/api/v1", tags=["classification"])

GRAPH = load_graph()

#: The five questions, in the order they are asked. `access` is first because a
#: "no" ends the flow: if nothing accesses a biological resource, the duties are
#: not engaged and saying so is the whole answer.
ABS_QUESTIONS = ("access", "who", "purpose", "ip", "knowledge")

#: Which orientation panels the interface should show, given the answers. Panel
#: keys, not statements — the copy lives in the locale files and every panel
#: renders its pending-source marker.
ABS_PANELS = ("authority", "firstStep", "sharing", "patent")

#: The instruments those panels will rest on once the corpus is ingested.
ABS_PENDING_SOURCES = (
    "in-biological-diversity-act-2002",
    "in-nba-abs-guidelines",
    "intl-nagoya-protocol",
    "in-patents-act-1970",
)


@router.post("/classify", response_model=ClassifyResult, response_model_by_alias=True)
def classify_product(
    body: ClassifyBody, session_id: str = Depends(session_header)
) -> ClassifyResult:
    enforce_rate_limit(session_id)
    try:
        asked, outcome = classify(GRAPH, body.answers)
    except KeyError as error:
        raise ApiError("unknown_answer", str(error), status_code=422) from error

    return ClassifyResult(
        asked=list(asked),
        next=None if outcome is not None else asked[-1],
        outcome_id=outcome.outcome_id if outcome else None,
        classes=[ProductClass(name) for name in outcome.classes] if outcome else [],
        questions_remaining_at_most=(0 if outcome else max(0, longest_path(GRAPH) - len(asked))),
    )


@router.post("/abs-check", response_model=AbsResult, response_model_by_alias=True)
def abs_check(body: AbsBody, session_id: str = Depends(session_header)) -> AbsResult:
    enforce_rate_limit(session_id)
    answers = body.answers

    next_question = next((q for q in ABS_QUESTIONS if q not in answers), None)

    # The first substantive answer can end it. Nothing accessed, nothing engaged.
    if answers.get("access") == "no":
        return AbsResult(engaged=False, panels=[], pending_sources=[], next_question=None)

    if next_question is not None:
        return AbsResult(
            engaged=True,
            panels=[],
            pending_sources=[],
            next_question=next_question,
        )

    return AbsResult(
        engaged=True,
        panels=list(ABS_PANELS),
        pending_sources=list(ABS_PENDING_SOURCES),
        next_question=None,
    )
