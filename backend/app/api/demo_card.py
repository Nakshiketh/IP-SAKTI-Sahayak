"""The demo member card: its details, and the QR image `issue-card` wrote.

Exists only when `ENABLE_DEMO_CARD=true` and the instance is not production;
otherwise both routes answer 404 as though they were never there. They are open
(no session), because the card is what a member signs in with.

Nothing here generates a card or touches a token. The details come from the
member and card tables; the image is the file `python -m app.auth.cli
issue-card` wrote to `demo/cards/`, served as it is. If that file is missing,
the answer says to run the command, rather than drawing one.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.auth.cli import CARDS_DIR
from app.auth.members import DEMO_MEMBER
from app.auth.store import connect
from app.core.errors import ApiError
from app.core.settings import get_settings

router = APIRouter(prefix="/api/v1/demo/member-card", tags=["demo"])


class DemoCard(BaseModel):
    name: str
    role: str
    institution: str
    member_id: str = Field(serialization_alias="memberId")
    #: ISO date the active card was issued, e.g. 2026-09-26.
    issued_on: str = Field(serialization_alias="issuedOn")


def _available() -> None:
    settings = get_settings()
    if not settings.enable_demo_card or settings.environment == "production":
        raise ApiError("not_found", "Not found.", 404)


def _card_image():
    return CARDS_DIR / f"{DEMO_MEMBER.member_id}-qr.png"


@router.get("", response_model=DemoCard, response_model_by_alias=True)
def demo_card() -> DemoCard:
    _available()
    with connect() as connection:
        row = connection.execute(
            "SELECT m.name, m.role, m.institution, m.member_id, t.issued_at"
            " FROM members m JOIN member_qr_tokens t ON t.member_fk = m.id"
            " WHERE m.member_id = ? AND t.revoked_at IS NULL",
            (DEMO_MEMBER.member_id,),
        ).fetchone()
    if row is None:
        raise ApiError(
            "card_not_issued",
            "No active card. Run: python -m app.auth.cli issue-card --member "
            f"{DEMO_MEMBER.member_id}",
            404,
        )
    if not _card_image().is_file():
        raise ApiError(
            "card_image_missing",
            "The card image has not been written. Run: python -m app.auth.cli issue-card "
            f"--member {DEMO_MEMBER.member_id}",
            404,
        )
    return DemoCard(
        name=row["name"],
        role=row["role"],
        institution=row["institution"],
        member_id=row["member_id"],
        issued_on=datetime.fromtimestamp(row["issued_at"], tz=UTC).date().isoformat(),
    )


@router.get("/qr.png", response_class=FileResponse)
def demo_card_qr() -> FileResponse:
    _available()
    path = _card_image()
    if not path.is_file():
        raise ApiError("card_image_missing", "The card image has not been written.", 404)
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})
