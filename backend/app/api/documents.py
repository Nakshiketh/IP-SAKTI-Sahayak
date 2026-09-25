"""Reading a document the user uploaded, and treating it as data.

Two things happen here, and they are deliberately separate calls rather than
one. `POST /documents/read` extracts text and hands it back. Whether to then
ask a question about it is the reader's decision, made after they have seen
what was actually extracted — because a PDF often yields something other than
what the person thought was in it, and a product that went straight from upload
to legal guidance would be answering about text nobody had looked at.

What this endpoint will not do:

* **Store anything.** The bytes are read in memory and dropped. Not saved, not
  cached, not logged. An uploaded formulation is an unpublished trade secret
  belonging to the person who uploaded it.
* **Treat the text as a source.** It is labelled as the reader's own document
  everywhere it appears, it is never cited, and it cannot enter retrieval.
* **Obey it.** Extracted text is data. A reader asks about a document by
  sending their question to `/api/v1/query` with `channel="document"` — the
  same path, the same guardrails, the same citation rules. There is
  deliberately no second entrance to the pipeline here, because a second
  entrance is a second place for those rules to drift out of step. The channel
  reaches the audit row and nothing else, so a file telling the product to
  ignore its rules is a file containing that sentence.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.auth import current_user
from app.core.settings import Settings, get_settings
from app.models.api import Wire
from app.reasoning import facts as facts_service
from app.services import documents as document_service

router = APIRouter(prefix="/api/v1", tags=["documents"])


class ReadDocument(Wire):
    filename: str
    #: "pdf" or "text" — what the bytes were, never what the name claimed.
    kind: str
    characters: int
    pages: int | None = None
    truncated: bool = False
    text: str
    #: Facts the extractor could read out of it, and what it could not find.
    #: Offered so the reader can see what a question would be answered from,
    #: and correct it, before anything is asked.
    stated_facts: list[str] = []
    missing_facts: list[str] = []
    #: Repeated on every response, and rendered beside the text. A reader
    #: looking at their own document next to a cited passage must never have to
    #: work out which is which.
    label: str = "USER DOCUMENT — not an authoritative source"


def _enabled() -> Settings:
    settings = get_settings()
    if not settings.feature_document_intel:
        raise HTTPException(status_code=404, detail="Document reading is not enabled.")
    return settings


@router.post("/documents/read", response_model=ReadDocument)
async def read_document(
    username: Annotated[str, Depends(current_user)],
    file: Annotated[UploadFile, File()],
) -> ReadDocument:
    _enabled()

    # Read first, then measure. A declared Content-Length is written by the
    # sender, so the only size worth enforcing is the one actually received.
    data = await file.read()
    try:
        extracted = document_service.extract(
            data, filename=file.filename, media_type=file.content_type
        )
    except document_service.DocumentRejected as rejected:
        raise HTTPException(
            status_code=413 if rejected.code == "too_large" else 415,
            detail={"code": rejected.code, "message": str(rejected)},
        ) from rejected

    found = facts_service.extract_facts(extracted.text)
    return ReadDocument(
        filename=document_service.safe_filename(file.filename),
        kind=extracted.kind,
        characters=extracted.characters,
        pages=extracted.pages,
        truncated=extracted.truncated,
        text=extracted.text,
        stated_facts=[fact.key for fact in found.stated],
        missing_facts=list(found.unknown),
    )
