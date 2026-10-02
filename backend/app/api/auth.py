"""Member sign-in: password login, QR sign-in, password change, who am I, log out.

Sessions are server-side rows with an opaque id in an HttpOnly cookie
(`app.auth.sessions`). Nothing here returns a token in a body, and nothing the
browser can read from script says who is signed in except `GET /me`.

There is no registration. Members are issued: the seed creates them and
`issue-card` gives them a card (`python -m app.auth.cli --help`).

**QR sign-in** is two steps: the card shown to the camera (`/qr/verify`), then
the code emailed to the member (`/otp/verify`). The card alone opens nothing.

**Forgot password** never says whether the details matched anyone: the same
answer, the same challenge id and the same timing, either way.
"""

from __future__ import annotations

import contextlib
import time
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.auth import limits, otp, passwords, reset, sessions
from app.auth.cards import BADGE_TOKEN
from app.auth.deps import (
    CurrentMember,
    Session,
    check_csrf,
    client_ip,
    require_member,
    user_agent,
)
from app.auth.hashing import hash_password, same, token_hash, verify_password
from app.auth.members import log_event, mask_email
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

SEND_FAILED = "We couldn't send the verification email. Try again in a moment."
FORGOT_SENT = (
    "If these details match a registered member, a verification code has been sent "
    "to the registered email."
)
RESET_EXPIRED = "This reset has expired. Request a new code."
RESET_COOKIE_PATH = "/api/v1/auth/password/reset"


class MemberCard(BaseModel):
    name: str
    role: str
    institution: str
    member_id: str = Field(serialization_alias="memberId")


class QrVerified(BaseModel):
    challenge_id: str = Field(serialization_alias="challengeId")
    member: MemberCard
    masked_email: str = Field(serialization_alias="maskedEmail")
    resend_available_at: float = Field(serialization_alias="resendAvailableAt")


class ChallengeBody(BaseModel):
    challenge_id: str = Field(min_length=1, max_length=64, alias="challengeId")


class CodeBody(ChallengeBody):
    code: str = Field(max_length=16)


class Resent(BaseModel):
    resend_available_at: float = Field(serialization_alias="resendAvailableAt")


class ForgotBody(BaseModel):
    identifier: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=1, max_length=200)


class ForgotSent(BaseModel):
    message: str
    challenge_id: str = Field(serialization_alias="challengeId")


class ResetBody(BaseModel):
    new_password: str = Field(max_length=256, alias="newPassword")
    confirm_password: str = Field(max_length=256, alias="confirmPassword")


class Done(BaseModel):
    message: str


def _attempts_left(remaining: int) -> str:
    return f"That code is incorrect. {remaining} attempt{'' if remaining == 1 else 's'} left."


def _otp_refusal(error: otp.OtpError) -> ApiError:
    """The API's answer for each way a code or a send can be refused."""
    match error:
        case otp.OtpIncorrect():
            remaining = int(error.details.get("attempts_remaining", 0))
            return ApiError(
                "OTP_INCORRECT",
                _attempts_left(remaining),
                400,
                extra={"attemptsRemaining": remaining},
            )
        case otp.OtpExpired():
            return ApiError("OTP_EXPIRED", "This code has expired. Request a new one.", 400)
        case otp.OtpLocked():
            return ApiError(
                "OTP_LOCKED",
                "Too many incorrect attempts. Scan your Member ID again to get a new code.",
                400,
            )
        case otp.ChallengeExpired():
            return ApiError("CHALLENGE_EXPIRED", "This verification has expired. Start again.", 400)
        case otp.OtpCooldown():
            return ApiError(
                "OTP_COOLDOWN",
                "Wait a moment before asking for another code.",
                429,
                extra={"retryAfter": int(error.details.get("retry_after", 60))},
            )
        case otp.OtpSendLimit():
            return ApiError("OTP_SEND_LIMIT", "Too many codes requested. Try again later.", 429)
        case _:
            return ApiError("OTP_SEND_FAILED", SEND_FAILED, 503)


@router.post("/qr/verify", response_model=QrVerified, response_model_by_alias=True)
async def qr_verify(request: Request) -> QrVerified:
    """Show a member card to the camera; on a match, email a code.

    The body is one still image, matched in memory against the card pattern
    (`app.core.badge`) and discarded. The card has no readable payload (it is
    the existing QR badge, kept at the member's request), so the image, not a
    decoded string, is what is sent. A match resolves to the card's member; a
    revoked card or an inactive member is refused by name. Nothing about the
    member is taken from the request.

    On a match: a login challenge is created, a code is emailed, and the reader
    is shown who they are signing in as. No session exists until the code is
    entered at `/otp/verify`.
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

    # Frames are cheap and arrive several a second; a recognised card starts a
    # challenge and sends an email, so it has a limit of its own.
    retry_after = limits.qr_match_per_ip().check(ip)
    if retry_after:
        raise RateLimited(retry_after)

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
        challenge_id = otp.create_challenge(connection, card["id"], "login")

    try:
        issued = await run_in_threadpool(_issue, challenge_id, ip)
    except otp.OtpError as error:
        raise _otp_refusal(error) from None

    return QrVerified(
        challenge_id=challenge_id,
        member=MemberCard(
            name=card["name"],
            role=card["role"],
            institution=card["institution"],
            member_id=card["member_id"],
        ),
        masked_email=mask_email(card["email"]),
        resend_available_at=issued.resend_available_at,
    )


def _issue(challenge_id: str, ip: str) -> otp.Issued:
    """Issue a code on a connection of its own (it may run on another thread)."""
    with connect() as connection:
        return otp.issue_code(connection, challenge_id, ip=ip)


@router.post("/otp/resend", response_model=Resent, response_model_by_alias=True)
def otp_resend(body: ChallengeBody, request: Request) -> Resent:
    """A new code for a live challenge, replacing the last one. Send limits apply."""
    check_csrf(request)
    try:
        issued = _issue(body.challenge_id, client_ip(request))
    except otp.OtpError as error:
        raise _otp_refusal(error) from None
    return Resent(resend_available_at=issued.resend_available_at)


@router.post("/otp/verify", response_model=NextStep)
def otp_verify(body: CodeBody, request: Request, response: Response) -> NextStep:
    """The emailed code for a QR sign-in. On success, a session."""
    check_csrf(request)
    ip = client_ip(request)
    retry_after = limits.otp_verify_per_ip().check(ip)
    if retry_after:
        raise RateLimited(retry_after)
    with connect() as connection:
        try:
            member_fk = otp.verify_code(
                connection, body.challenge_id, body.code, purpose="login", ip=ip
            )
        except otp.OtpError as error:
            raise _otp_refusal(error) from None
        now = time.time()
        connection.execute(
            "UPDATE members SET last_login_at = ?, updated_at = ? WHERE id = ?",
            (now, now, member_fk),
        )
        connection.commit()
        log_event(connection, "login_success", member_fk, ip, user_agent(request))
        member = connection.execute("SELECT * FROM members WHERE id = ?", (member_fk,)).fetchone()
    return _start_session(request, response, dict(member))


# -- forgot password -------------------------------------------------------------


@router.post("/password/forgot", response_model=ForgotSent, response_model_by_alias=True)
def password_forgot(body: ForgotBody, request: Request, background: BackgroundTasks) -> ForgotSent:
    """Start a password reset. The answer is the same whether or not anyone matched.

    Matching details get a real challenge and an emailed code; anything else
    gets a decoy challenge with no member, which no code will ever satisfy.
    The code is issued after the response in both cases, so a real match takes
    no longer to answer than a miss.
    """
    check_csrf(request)
    _refuse_if_password_fixed()
    ip = client_ip(request)
    identifier = body.identifier.strip().lower()
    for limiter, key in (
        (limits.forgot_per_identifier(), identifier),
        (limits.forgot_per_ip(), ip),
    ):
        retry_after = limiter.check(key)
        if retry_after:
            raise RateLimited(retry_after)

    with connect() as connection:
        row = connection.execute(
            "SELECT id, email FROM members WHERE (username = ? OR lower(member_id) = ?)"
            " AND is_active = 1",
            (identifier, identifier),
        ).fetchone()
        matched = row is not None and same(row["email"], body.email.strip().lower())
        challenge_id = otp.create_challenge(
            connection, row["id"] if matched else None, "password_reset"
        )
        if matched:
            log_event(connection, "password_reset_requested", row["id"], ip, user_agent(request))

    background.add_task(_send_reset_code, challenge_id, ip)
    return ForgotSent(message=FORGOT_SENT, challenge_id=challenge_id)


PASSWORD_FIXED = (
    "The password on this site is kept by its host and cannot be changed here."
    " Log in with that password, or scan your Member ID."
)


def _refuse_if_password_fixed() -> None:
    """A change here would be lost the next time the host restarts, so none is taken."""
    if get_settings().demo_member_password:
        raise ApiError("password_fixed", PASSWORD_FIXED, 409)


def _send_reset_code(challenge_id: str, ip: str) -> None:
    """After the response: issue (and, for a real member, email) the code."""
    # A failure is already an auth event where there is a member, and the
    # request's answer could not have depended on it.
    with contextlib.suppress(otp.OtpError):
        _issue(challenge_id, ip)


@router.post("/password/forgot/verify", response_model=Done)
def password_forgot_verify(body: CodeBody, request: Request, response: Response) -> Done:
    """The emailed reset code. On success, a ten-minute, single-use reset cookie."""
    check_csrf(request)
    ip = client_ip(request)
    retry_after = limits.otp_verify_per_ip().check(ip)
    if retry_after:
        raise RateLimited(retry_after)
    with connect() as connection:
        try:
            member_fk = otp.verify_code(
                connection, body.challenge_id, body.code, purpose="password_reset", ip=ip
            )
        except otp.OtpError as error:
            raise _otp_refusal(error) from None
        raw = reset.issue(connection, member_fk)
    response.set_cookie(
        reset.COOKIE_NAME,
        raw,
        max_age=reset.LIFETIME_SECONDS,
        path=RESET_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=get_settings().cookie_secure,
    )
    return Done(message="Code verified. Choose a new password.")


@router.post("/password/reset", response_model=Done)
def password_reset(body: ResetBody, request: Request, response: Response) -> Done:
    """Set a new password with the reset cookie. Ends every session the member has."""
    check_csrf(request)
    _refuse_if_password_fixed()
    raw = request.cookies.get(reset.COOKIE_NAME, "")
    with connect() as connection:
        # Looked at before it is spent, so a password that breaks a rule can be
        # corrected without starting the reset again.
        holder = reset.holder(connection, raw)
        if holder is None:
            raise ApiError("RESET_EXPIRED", RESET_EXPIRED, 400)
        found = passwords.problems(
            body.new_password,
            body.confirm_password,
            username=holder["username"],
            member_id=holder["member_id"],
            current_hash=holder["password_hash"],
        )
        if found:
            raise ApiError(found[0], "The new password does not meet the rules.", 422)

        member_fk = reset.consume(connection, raw)
        if member_fk is None:
            raise ApiError("RESET_EXPIRED", RESET_EXPIRED, 400)
        now = time.time()
        connection.execute(
            "UPDATE members SET password_hash = ?, must_change_password = 0,"
            " password_changed_at = ?, failed_login_count = 0, locked_until = NULL,"
            " updated_at = ? WHERE id = ?",
            (hash_password(body.new_password), now, now, member_fk),
        )
        connection.commit()
        sessions.revoke_all(connection, member_fk)
        log_event(connection, "password_reset", member_fk, client_ip(request), user_agent(request))

    response.delete_cookie(
        reset.COOKIE_NAME,
        path=RESET_COOKIE_PATH,
        httponly=True,
        samesite="strict",
        secure=get_settings().cookie_secure,
    )
    # This browser's own session, if it had one, is over too.
    _clear_cookie(response)
    return Done(message="Password updated. Log in with your new password.")


@router.post("/password/change", response_model=NextStep)
def change_password(
    body: ChangePasswordBody, member: Session, request: Request, response: Response
) -> NextStep:
    _refuse_if_password_fixed()
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
