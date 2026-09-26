"""One-time codes: issued against a challenge, emailed, checked once.

**A challenge** is one attempt at one thing: a login, or a password reset, for
one member. Its id is 192 random bits and it lives 10 minutes. A code belongs
to exactly one challenge, and its HMAC is keyed with the challenge id, so a code
issued for a login cannot be replayed against a reset, or against anyone else's
login.

**A code** is six digits from `secrets.randbelow`, stored only as an HMAC keyed
with `OTP_SECRET`. It lives 5 minutes, is used at most once, and survives at
most 5 wrong guesses. Sending a new code for a challenge invalidates the old
one.

**Send limits:** 60 seconds between sends on a challenge, 5 sends an hour per
member, 20 an hour per address.

**No fallback.** If the email fails, the code is invalidated and the caller gets
an error. The code is never logged, printed or returned — in any environment.

A challenge with no member (the decoy a forgot-password request gets when the
details match nobody, Phase 4) is handled here too: a code is recorded so the
work done is the same, no email is sent, and no code ever verifies against it.
It answers exactly as a real challenge would to someone who never has the
code: incorrect, then locked.
"""

from __future__ import annotations

import secrets
import sqlite3
import time
from dataclasses import dataclass
from datetime import UTC, datetime

from app.auth import email
from app.auth.hashing import otp_hash, same
from app.auth.members import log_event
from app.auth.templates import Purpose, otp_email
from app.core.settings import get_settings

CHALLENGE_SECONDS = 10 * 60
CODE_SECONDS = 5 * 60
MAX_ATTEMPTS = 5
COOLDOWN_SECONDS = 60
MEMBER_SENDS_PER_HOUR = 5
IP_SENDS_PER_HOUR = 20
HOUR = 60 * 60


# -- errors --------------------------------------------------------------------


class OtpError(Exception):
    """A refusal with a stable code the API passes on."""

    code = "OTP_ERROR"

    def __init__(self, **details: object) -> None:
        super().__init__(self.code)
        self.details = details


class ChallengeExpired(OtpError):
    code = "CHALLENGE_EXPIRED"


class OtpIncorrect(OtpError):
    code = "OTP_INCORRECT"


class OtpExpired(OtpError):
    code = "OTP_EXPIRED"


class OtpLocked(OtpError):
    code = "OTP_LOCKED"


class OtpCooldown(OtpError):
    code = "OTP_COOLDOWN"


class OtpSendLimit(OtpError):
    code = "OTP_SEND_LIMIT"


class OtpSendFailed(OtpError):
    code = "OTP_SEND_FAILED"


# -- codes and challenges --------------------------------------------------------


def generate_code() -> str:
    """Six digits, uniform over 000000-999999, from the OS's secure generator."""
    return f"{secrets.randbelow(1_000_000):06d}"


def create_challenge(
    connection: sqlite3.Connection,
    member_fk: int | None,
    purpose: Purpose,
    now: float | None = None,
) -> str:
    moment = time.time() if now is None else now
    challenge_id = secrets.token_urlsafe(24)
    connection.execute(
        "INSERT INTO auth_challenges (id, member_fk, purpose, created_at, expires_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (challenge_id, member_fk, purpose, moment, moment + CHALLENGE_SECONDS),
    )
    connection.commit()
    return challenge_id


def _challenge(connection: sqlite3.Connection, challenge_id: str) -> sqlite3.Row | None:
    if not challenge_id or len(challenge_id) > 64:
        return None
    return connection.execute(
        "SELECT c.*, m.email, m.is_active FROM auth_challenges c"
        " LEFT JOIN members m ON m.id = c.member_fk WHERE c.id = ?",
        (challenge_id,),
    ).fetchone()


def _live(challenge: sqlite3.Row | None, moment: float) -> bool:
    return (
        challenge is not None
        and challenge["completed_at"] is None
        and moment < challenge["expires_at"]
    )


# -- sending ---------------------------------------------------------------------


@dataclass(frozen=True)
class Issued:
    resend_available_at: float


def issue_code(
    connection: sqlite3.Connection,
    challenge_id: str,
    *,
    ip: str | None,
    now: float | None = None,
) -> Issued:
    """Invalidate any earlier code, record a new one, and email it.

    Raises `ChallengeExpired`, `OtpCooldown`, `OtpSendLimit` or `OtpSendFailed`.
    """
    moment = time.time() if now is None else now
    challenge = _challenge(connection, challenge_id)
    if not _live(challenge, moment):
        raise ChallengeExpired()

    last = connection.execute(
        "SELECT max(created_at) FROM otp_codes WHERE challenge_fk = ?", (challenge_id,)
    ).fetchone()[0]
    if last is not None and moment - last < COOLDOWN_SECONDS:
        raise OtpCooldown(retry_after=int(last + COOLDOWN_SECONDS - moment) + 1)

    member = challenge["member_fk"]
    if member is not None:
        sent = connection.execute(
            "SELECT count(*) FROM otp_codes o JOIN auth_challenges c ON c.id = o.challenge_fk"
            " WHERE c.member_fk = ? AND o.created_at > ?",
            (member, moment - HOUR),
        ).fetchone()[0]
        if sent >= MEMBER_SENDS_PER_HOUR:
            raise OtpSendLimit()
    if ip:
        sent = connection.execute(
            "SELECT count(*) FROM otp_codes WHERE requester_ip = ? AND created_at > ?",
            (ip, moment - HOUR),
        ).fetchone()[0]
        if sent >= IP_SENDS_PER_HOUR:
            raise OtpSendLimit()

    connection.execute(
        "UPDATE otp_codes SET invalidated_at = ?"
        " WHERE challenge_fk = ? AND used_at IS NULL AND invalidated_at IS NULL",
        (moment, challenge_id),
    )
    code = generate_code()
    cursor = connection.execute(
        "INSERT INTO otp_codes (challenge_fk, code_hash, expires_at, max_attempts,"
        " created_at, requester_ip) VALUES (?, ?, ?, ?, ?, ?)",
        (
            challenge_id,
            otp_hash(get_settings().otp_secret, challenge_id, code),
            moment + CODE_SECONDS,
            MAX_ATTEMPTS,
            moment,
            ip,
        ),
    )
    connection.commit()
    row_id = cursor.lastrowid

    # A decoy challenge has nobody to email; the row above is all it gets.
    if member is not None and challenge["is_active"]:
        rendered = otp_email(code, challenge["purpose"], datetime.fromtimestamp(moment, tz=UTC))
        try:
            email.send_email(
                to=challenge["email"],
                subject=rendered.subject,
                html=rendered.html,
                text=rendered.text,
            )
        except (email.EmailFailed, email.EmailNotConfigured) as error:
            connection.execute(
                "UPDATE otp_codes SET invalidated_at = ? WHERE id = ?", (moment, row_id)
            )
            connection.commit()
            log_event(connection, "otp_send_failed", member, ip)
            raise OtpSendFailed(reason=str(error)) from None
        log_event(connection, "otp_sent", member, ip)

    return Issued(resend_available_at=moment + COOLDOWN_SECONDS)


# -- checking ----------------------------------------------------------------------


def verify_code(
    connection: sqlite3.Connection,
    challenge_id: str,
    code: str,
    *,
    purpose: Purpose,
    ip: str | None = None,
    now: float | None = None,
) -> int:
    """Check a code. Returns the member's id and completes the challenge.

    Raises `ChallengeExpired`, `OtpExpired`, `OtpLocked` or `OtpIncorrect`
    (with `attempts_remaining`). A decoy challenge never verifies.
    """
    moment = time.time() if now is None else now
    challenge = _challenge(connection, challenge_id)
    if not _live(challenge, moment) or challenge["purpose"] != purpose:
        raise ChallengeExpired()

    row = connection.execute(
        "SELECT * FROM otp_codes WHERE challenge_fk = ? AND used_at IS NULL"
        " ORDER BY id DESC LIMIT 1",
        (challenge_id,),
    ).fetchone()
    if row is None or row["invalidated_at"] is not None:
        if row is not None and row["attempts"] >= row["max_attempts"]:
            raise OtpLocked()
        raise OtpExpired()
    if moment >= row["expires_at"]:
        raise OtpExpired()

    candidate = code.strip() if isinstance(code, str) else ""
    valid = (
        len(candidate) == 6
        and candidate.isdigit()
        and same(row["code_hash"], otp_hash(get_settings().otp_secret, challenge_id, candidate))
        and challenge["member_fk"] is not None
    )

    if not valid:
        attempts = row["attempts"] + 1
        locked = attempts >= row["max_attempts"]
        connection.execute(
            "UPDATE otp_codes SET attempts = ?, invalidated_at = ? WHERE id = ?",
            (attempts, moment if locked else None, row["id"]),
        )
        connection.commit()
        log_event(connection, "otp_failed", challenge["member_fk"], ip)
        if locked:
            raise OtpLocked()
        raise OtpIncorrect(attempts_remaining=row["max_attempts"] - attempts)

    connection.execute("UPDATE otp_codes SET used_at = ? WHERE id = ?", (moment, row["id"]))
    connection.execute(
        "UPDATE auth_challenges SET completed_at = ? WHERE id = ?", (moment, challenge_id)
    )
    connection.commit()
    log_event(connection, "otp_verified", challenge["member_fk"], ip)
    return int(challenge["member_fk"])
