"""Sign-in, registration and badge sign-in.

Three endpoints and one store. Accounts live in a SQLite file of their own,
beside the audit log and the records database rather than inside either: an
account is not a corpus passage and it is not evidence of a filing, and putting
it in either store would be the kind of mixing this product spends its
architecture avoiding.

**What this is not.** Sessions are bearer tokens signed with an HMAC over a
process-local secret, which is enough to prove this instance issued them and
nothing more. There is no refresh, no revocation list and no rotation. Before
this carries a real user, the token belongs in an httpOnly cookie, the secret
belongs in the environment rather than in memory, and passwords deserve a
purpose-built KDF rather than the PBKDF2 below.

Passwords are stored as PBKDF2-HMAC-SHA256 with a per-account salt. That is
stdlib, so it adds no dependency, and it is a real KDF rather than a hash — a
plain SHA-256 of a password is a lookup table away from plaintext.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.core.badge import is_badge
from app.core.errors import ApiError
from app.core.settings import get_settings

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

#: Deliberately permissive: the only claims worth making here are that there is
#: something before the @, something after it, and a dot in the domain. A
#: stricter pattern rejects valid addresses, and the authority on whether an
#: address works is whether mail sent to it arrives.
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

#: Cost factor. 200k is the low end of current guidance and stays responsive on
#: the modest hardware this is expected to run on.
PBKDF2_ROUNDS = 200_000

#: How long a session lasts. Short, because there is no refresh path.
TOKEN_TTL_SECONDS = 12 * 60 * 60

#: Signing key. Generated per process: restarting invalidates every session,
#: which is the honest behaviour for a secret that was never persisted.
_SECRET = secrets.token_bytes(32)


# -- storage -----------------------------------------------------------------


def _db_path() -> Path:
    settings = get_settings()
    return settings.data_dir / "accounts.sqlite3"


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            username    TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            email       TEXT NOT NULL,
            salt        BLOB NOT NULL,
            password    BLOB NOT NULL,
            badge_code  TEXT UNIQUE,
            created_at  REAL NOT NULL
        )
        """
    )
    connection.commit()
    return connection


def _hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)


def ensure_demo_account() -> None:
    """Seed one account, so a fresh install can be signed into.

    Idempotent. The credentials are in the README and on the sign-in page: this
    is a demonstration instance, and a hidden default account would be worse
    than a published one.
    """
    with _connect() as connection:
        exists = connection.execute(
            "SELECT 1 FROM accounts WHERE username = ?", ("demo",)
        ).fetchone()
        if exists:
            return
        salt = os.urandom(16)
        connection.execute(
            "INSERT INTO accounts (username, name, email, salt, password, badge_code, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "demo",
                "Demo User",
                "demo@example.com",
                salt,
                _hash("demo1234", salt),
                "SAHAYAK-001",
                time.time(),
            ),
        )
        connection.commit()


# -- tokens ------------------------------------------------------------------


def _b64(raw: bytes) -> str:
    return urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(raw: str) -> bytes:
    return urlsafe_b64decode(raw + "=" * (-len(raw) % 4))


def issue_token(username: str) -> str:
    payload = json.dumps(
        {"sub": username, "exp": int(time.time()) + TOKEN_TTL_SECONDS}, separators=(",", ":")
    ).encode("utf-8")
    signature = hmac.new(_SECRET, payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(signature)}"


def read_token(token: str) -> str | None:
    """Return the username a token names, or None if it does not verify."""
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        payload = _unb64(encoded_payload)
        expected = hmac.new(_SECRET, payload, hashlib.sha256).digest()
        # Constant-time: a timing-variable comparison here leaks the signature
        # one byte at a time.
        if not hmac.compare_digest(expected, _unb64(encoded_signature)):
            return None
        claims = json.loads(payload)
    except Exception:
        return None

    if not isinstance(claims, dict) or claims.get("exp", 0) < time.time():
        return None
    subject = claims.get("sub")
    return subject if isinstance(subject, str) else None


# -- wire models -------------------------------------------------------------


class LoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200)
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class AuthUser(BaseModel):
    name: str
    username: str
    email: str


class AuthResult(BaseModel):
    token: str
    user: AuthUser


def _result(row: sqlite3.Row) -> AuthResult:
    return AuthResult(
        token=issue_token(row["username"]),
        user=AuthUser(name=row["name"], username=row["username"], email=row["email"]),
    )


# -- endpoints ---------------------------------------------------------------


@router.post("/login", response_model=AuthResult)
def login(body: LoginBody) -> AuthResult:
    ensure_demo_account()
    username = body.username.strip().lower()

    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM accounts WHERE username = ?", (username,)
        ).fetchone()

    # One message whether the account is missing or the password is wrong: two
    # messages tell an attacker which usernames exist.
    if row is None or not hmac.compare_digest(row["password"], _hash(body.password, row["salt"])):
        raise ApiError("invalid_credentials", "That username and password do not match.", 401)

    return _result(row)


@router.post("/register", response_model=AuthResult, status_code=201)
def register(body: RegisterBody) -> AuthResult:
    ensure_demo_account()
    username = body.username.strip().lower()
    email = body.email.strip()

    if not EMAIL.match(email):
        raise ApiError("invalid_email", "Enter a valid email address.", 422)

    salt = os.urandom(16)
    try:
        with _connect() as connection:
            connection.execute(
                "INSERT INTO accounts"
                " (username, name, email, salt, password, badge_code, created_at)"
                " VALUES (?, ?, ?, ?, ?, NULL, ?)",
                (username, body.name.strip(), email, salt, _hash(body.password, salt), time.time()),
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM accounts WHERE username = ?", (username,)
            ).fetchone()
    except sqlite3.IntegrityError as error:
        raise ApiError("username_taken", "That username is already registered.", 409) from error

    return _result(row)


#: The account the authorised QR code signs into.
BADGE_ACCOUNT_CODE = "SAHAYAK-001"

#: Still images only; anything else is refused before it reaches the decoder.
BADGE_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")


@router.post("/badge", response_model=AuthResult)
async def badge(request: Request) -> AuthResult:
    """Sign in by showing the authorised QR code to the camera.

    The body is one still image — a camera frame or a photo. It is compared in
    memory with the one authorised code (`app.core.badge`) and discarded; nothing
    is stored. Three answers: a session; `no_code` when no QR code is in view; and
    `invalid_qr` when a QR code is in view but it is not the authorised one.

    This is the only QR route. There is deliberately no endpoint that accepts a
    typed or decoded string: a string can be produced by any QR generator.
    """
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
        raise ApiError("invalid_qr", "Invalid QR Code – Access Denied.", 403)

    ensure_demo_account()
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM accounts WHERE badge_code = ?", (BADGE_ACCOUNT_CODE,)
        ).fetchone()
    if row is None:
        raise ApiError("invalid_qr", "Invalid QR Code – Access Denied.", 403)
    return _result(row)


def current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Dependency for anything that should require a session."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError("not_authenticated", "Sign in to continue.", 401)
    username = read_token(authorization.split(" ", 1)[1].strip())
    if username is None:
        raise ApiError("session_expired", "That session has expired. Sign in again.", 401)
    return username


@router.get("/me", response_model=AuthUser)
def me(username: Annotated[str, Depends(current_user)]) -> AuthUser:
    """Confirm a stored token is still good, on a page load."""
    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM accounts WHERE username = ?", (username,)
        ).fetchone()
    if row is None:
        raise ApiError("session_expired", "That account no longer exists.", 401)
    return AuthUser(name=row["name"], username=row["username"], email=row["email"])
