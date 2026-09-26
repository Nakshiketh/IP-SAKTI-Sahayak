"""Member sign-in: password login, QR sign-in, password change, who am I, log out.

Sessions are server-side rows with an opaque id in an HttpOnly cookie
(`app.auth.sessions`). Nothing here returns a token in a body, and nothing the
browser can read from script says who is signed in except `GET /me`.

There is no registration. Members are issued: the seed creates them and
`issue-card` gives them a card (`python -m app.auth.cli --help`).

**QR sign-in, for now.** `POST /badge` still signs a member straight in when the
camera shows their card, as the old sign-in did. Phase 4 puts an emailed
one-time code between the card and the session; until then the card alone is
the credential, exactly as before this change.
"""

from __future__ import annotations

import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.auth import limits, passwords, sessions
from app.auth.cards import BADGE_TOKEN
from app.auth.deps import (
    CurrentMember,
    Session,
    check_csrf,
    client_ip,
    require_member,
    user_agent,
)
from app.auth.hashing import hash_password, token_hash, verify_password
from app.auth.members import log_event
from app.auth.store import connect
from app.core.badge import is_badge
from app.core.errors import ApiError, RateLimited
from app.core.settings import get_settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

#: Five wrong passwords lock the account for fifteen minutes.
MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60

INCORRECT = "Member ID/username or password is incorrect."
LOCKED = "Too many failed attempts. Try again in 15 minutes, or reset your password."
QR_INVALID = "This QR code isn't an IP-SAKTI Sahayak Member ID. Scan the QR on your member card."

Next = Literal["change-password", "dashboard"]


# -- wire models -------------------------------------------------------------


class LoginBody(BaseModel):
    identifier: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class ChangePasswordBody(BaseModel):
    current_password: str | None = Field(default=None, max_length=256, alias="currentPassword")
    new_password: str = Field(max_length=256, alias="newPassword")
    confirm_password: str = Field(max_length=256, alias="confirmPassword")


class NextStep(BaseModel):
    next: Next


class Me(BaseModel):
    name: str
    role: str
    institution: str
    member_id: str = Field(serialization_alias="memberId")
    restricted: bool


# -- helpers -----------------------------------------------------------------


def _set_cookie(response: Response, raw: str, *, restricted: bool) -> None:
    response.set_cookie(
        sessions.COOKIE_NAME,
        raw,
        max_age=sessions.RESTRICTED_SECONDS if restricted else sessions.ABSOLUTE_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=get_settings().cookie_secure,
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(
        sessions.COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=get_settings().cookie_secure,
    )


def _start_session(request: Request, response: Response, member: dict) -> NextStep:
    """End whatever session this browser had, and issue a fresh one."""
    restricted = bool(member["must_change_password"])
    with connect() as connection:
        sessions.revoke(connection, request.cookies.get(sessions.COOKIE_NAME, ""))
        raw = sessions.create(
            connection,
            member["id"],
            restricted=restricted,
            ip=client_ip(request),
            user_agent=user_agent(request),
        )
    _set_cookie(response, raw, restricted=restricted)
    return NextStep(next="change-password" if restricted else "dashboard")


# -- endpoints ---------------------------------------------------------------


@router.post("/login", response_model=NextStep)
def login(body: LoginBody, request: Request, response: Response) -> NextStep:
    check_csrf(request)
    ip, agent = client_ip(request), user_agent(request)
    retry_after = limits.login_per_ip().check(ip)
    if retry_after:
        raise RateLimited(retry_after)

    identifier = body.identifier.strip().lower()
    now = time.time()
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM members WHERE username = ? OR lower(member_id) = ?",
            (identifier, identifier),
        ).fetchone()

        if row is None or not row["is_active"]:
            # Costs a full argon2 verify, like a real account, so timing does not
            # say whether this identifier exists.
            verify_password(None, body.password)
            log_event(connection, "login_failed", None, ip, agent)
            raise ApiError("invalid_credentials", INCORRECT, 401)

        if row["locked_until"] and row["locked_until"] > now:
            verify_password(None, body.password)
            log_event(connection, "login_locked", row["id"], ip, agent)
            raise ApiError("account_locked", LOCKED, 423)

        if not verify_password(row["password_hash"], body.password):
            failures = row["failed_login_count"] + 1
            locked = failures >= MAX_FAILED_LOGINS
            connection.execute(
                "UPDATE members SET failed_login_count = ?, locked_until = ?, updated_at = ?"
                " WHERE id = ?",
                (
                    0 if locked else failures,
                    now + LOCKOUT_SECONDS if locked else None,
                    now,
                    row["id"],
                ),
            )
            connection.commit()
            log_event(connection, "login_failed", row["id"], ip, agent)
            if locked:
                raise ApiError("account_locked", LOCKED, 423)
            raise ApiError("invalid_credentials", INCORRECT, 401)

        connection.execute(
            "UPDATE members SET failed_login_count = 0, locked_until = NULL,"
            " last_login_at = ?, updated_at = ? WHERE id = ?",
            (now, now, row["id"]),
        )
        connection.commit()
        log_event(connection, "login_success", row["id"], ip, agent)

    return _start_session(request, response, dict(row))


#: Still images only; anything else is refused before it reaches the matcher.
BADGE_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")


@router.post("/badge", response_model=NextStep)
async def badge(request: Request, response: Response) -> NextStep:
    """Sign in by showing a member card to the camera.

    The body is one still image. It is matched in memory against the card
    pattern (`app.core.badge`) and discarded. The pattern resolves to a card
    row, and the card to its member; a revoked card or an inactive member is
    refused with its own code.
    """
    check_csrf(request)
    ip, agent = client_ip(request), user_agent(request)
    retry_after = limits.badge_per_ip().check(ip)
    if retry_after:
        raise RateLimited(retry_after)

    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in BADGE_IMAGE_TYPES:
        raise ApiError("invalid_image", "Send the frame as a JPEG, PNG or WebP image.", 415)
    image = await request.body()
    if not image:
        raise ApiError("invalid_image", "The image was empty.", 422)

    match = await run_in_threadpool(is_badge, image)
    if match is None:
        raise ApiError("no_code", "No QR code was found in that image.", 422)
    if not match:
        raise ApiError("QR_INVALID", QR_INVALID, 403)

    digest = token_hash(BADGE_TOKEN)
    with connect() as connection:
        card = connection.execute(
            "SELECT t.revoked_at, m.* FROM member_qr_tokens t JOIN members m ON m.id = t.member_fk"
            " WHERE t.token_hash = ? ORDER BY t.revoked_at IS NULL DESC, t.id DESC LIMIT 1",
            (digest,),
        ).fetchone()
        if card is None:
            raise ApiError("QR_INVALID", QR_INVALID, 403)
        if card["revoked_at"] is not None:
            log_event(connection, "qr_rejected_revoked", card["id"], ip, agent)
            raise ApiError(
                "QR_REVOKED",
                "This Member ID has been replaced or revoked. Contact the portal administrator.",
                403,
            )
        if not card["is_active"]:
            raise ApiError("MEMBER_INACTIVE", "This membership is not active.", 403)
        log_event(connection, "qr_verified", card["id"], ip, agent)
        now = time.time()
        connection.execute(
            "UPDATE members SET last_login_at = ?, updated_at = ? WHERE id = ?",
            (now, now, card["id"]),
        )
        connection.commit()

    return _start_session(request, response, dict(card))


@router.post("/password/change", response_model=NextStep)
def change_password(
    body: ChangePasswordBody, member: Session, request: Request, response: Response
) -> NextStep:
    with connect() as connection:
        row = connection.execute("SELECT * FROM members WHERE id = ?", (member.pk,)).fetchone()

        # A full session proves the member once knew the password; changing it
        # still needs the current one, so an unattended browser is not enough.
        if not member.restricted and not verify_password(
            row["password_hash"], body.current_password or ""
        ):
            raise ApiError("current_password_incorrect", "Your current password is incorrect.", 400)

        found = passwords.problems(
            body.new_password,
            body.confirm_password,
            username=row["username"],
            member_id=row["member_id"],
            current_hash=row["password_hash"],
        )
        if found:
            raise ApiError(found[0], "The new password does not meet the rules.", 422)

        now = time.time()
        connection.execute(
            "UPDATE members SET password_hash = ?, must_change_password = 0,"
            " password_changed_at = ?, updated_at = ? WHERE id = ?",
            (hash_password(body.new_password), now, now, member.pk),
        )
        connection.commit()
        # Every other session ends, this one included; a new full one replaces it.
        sessions.revoke_all(connection, member.pk)
        log_event(
            connection, "password_changed", member.pk, client_ip(request), user_agent(request)
        )
        row = connection.execute("SELECT * FROM members WHERE id = ?", (member.pk,)).fetchone()

    return _start_session(request, response, dict(row))


@router.get("/me", response_model=Me, response_model_by_alias=True)
def me(member: Session) -> Me:
    return Me(
        name=member.name,
        role=member.role,
        institution=member.institution,
        member_id=member.member_id,
        restricted=member.restricted,
    )


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> Response:
    """End this browser's session. Answers 204 whether or not one was live."""
    check_csrf(request)
    raw = request.cookies.get(sessions.COOKIE_NAME, "")
    member = None
    if raw:
        with connect() as connection:
            row = sessions.lookup(connection, raw)
            member = int(row["member_pk"]) if row else None
            sessions.revoke(connection, raw)
            if member is not None:
                log_event(connection, "logout", member, client_ip(request), user_agent(request))
    reply = Response(status_code=204)
    _clear_cookie(reply)
    return reply


def current_user(member: Annotated[CurrentMember, Depends(require_member)]) -> str:
    """The signed-in member's username, for routers keyed on it."""
    return member.username
