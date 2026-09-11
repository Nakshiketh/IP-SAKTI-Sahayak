"""The invention analyst's endpoints. Every one requires a signed-in account.

A turn streams newline-delimited JSON, the same way `/query` does:

    {"event":"stage","id":"products","ran":true,"ms":3.1}
    {"event":"result","conversation":{...}}

An error after the first byte travels as an event, because the status line has
already gone.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.analyst.evidence import get_products
from app.analyst.model_reader import build_reader
from app.analyst.models import Conversation, ConversationSummary
from app.analyst.service import AnalystService, InventionEdit
from app.analyst.store import AnalystStore
from app.analyst.vocabulary import get_vocabulary
from app.api.auth import current_user
from app.api.deps import enforce_rate_limit, get_records_service
from app.core.errors import ApiError
from app.core.settings import get_settings

router = APIRouter(prefix="/api/v1/analyst", tags=["analyst"])

MAX_MESSAGE_CHARS = 4000


def _db_path() -> Path:
    return get_settings().data_dir / "analyses.sqlite3"


@lru_cache
def _service_for(path: str) -> AnalystService:
    vocabulary = get_vocabulary()
    return AnalystService(
        AnalystStore(Path(path)),
        get_records_service(),
        vocabulary,
        get_products(),
        reader=build_reader(get_settings(), vocabulary),
    )


def get_analyst_service() -> AnalystService:
    return _service_for(str(_db_path()))


User = Annotated[str, Depends(current_user)]


class MessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


def _stream(events: Iterator[dict]) -> StreamingResponse:
    def lines() -> Iterator[str]:
        try:
            for event in events:
                yield json.dumps(event, default=str, ensure_ascii=False) + "\n"
        except ApiError as error:
            yield (
                json.dumps({"event": "error", "code": error.code, "message": error.message}) + "\n"
            )

    return StreamingResponse(
        lines(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def _checked(service: AnalystService, username: str, conversation_id: str) -> None:
    # Resolved before the stream starts, so a wrong id is a real 404.
    service.get(username, conversation_id)


@router.get("/status")
def status(_user: User) -> dict:
    return get_analyst_service().status()


@router.get("/conversations", response_model=list[ConversationSummary])
def conversations(user: User) -> list[ConversationSummary]:
    return get_analyst_service().conversations(user)


@router.post("/conversations", response_model=Conversation, status_code=201)
def create(user: User) -> Conversation:
    enforce_rate_limit("analyst:" + user)
    return get_analyst_service().create(user)


@router.get("/conversations/{conversation_id}", response_model=Conversation)
def get(conversation_id: str, user: User) -> Conversation:
    return get_analyst_service().get(user, conversation_id)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete(conversation_id: str, user: User) -> None:
    get_analyst_service().delete(user, conversation_id)


@router.post("/conversations/{conversation_id}/messages")
def message(conversation_id: str, body: MessageBody, user: User) -> StreamingResponse:
    enforce_rate_limit("analyst:" + user)
    text = body.text.strip()
    if not text:
        raise ApiError("empty_message", "No message was sent.", 422)
    service = get_analyst_service()
    _checked(service, user, conversation_id)
    return _stream(service.turn(user, conversation_id, text=text))


@router.post("/conversations/{conversation_id}/edit")
def edit(conversation_id: str, body: InventionEdit, user: User) -> StreamingResponse:
    enforce_rate_limit("analyst:" + user)
    service = get_analyst_service()
    _checked(service, user, conversation_id)
    return _stream(service.turn(user, conversation_id, edit=body))


@router.post("/conversations/{conversation_id}/analyse")
def analyse(conversation_id: str, user: User) -> StreamingResponse:
    enforce_rate_limit("analyst:" + user)
    service = get_analyst_service()
    _checked(service, user, conversation_id)
    return _stream(service.turn(user, conversation_id, rerun=True))
