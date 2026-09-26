"""The single-use token a verified password-reset code earns.

Held in an HttpOnly cookie for ten minutes, good for exactly one password
change, and stored only as an HMAC keyed with `SESSION_SECRET` (with its own
label, so a reset token can never be mistaken for a session id).
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time

from app.core.settings import get_settings

COOKIE_NAME = "sahayak_reset"
LIFETIME_SECONDS = 10 * 60


def _hash(raw: str) -> str:
    secret = get_settings().session_secret
    if not secret:
        raise RuntimeError("SESSION_SECRET is not set.")
    return hmac.new(secret.encode("utf-8"), f"reset:{raw}".encode(), hashlib.sha256).hexdigest()


def issue(connection: sqlite3.Connection, member_fk: int, now: float | None = None) -> str:
    moment = time.time() if now is None else now
    raw = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO reset_tokens (id_hash, member_fk, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (_hash(raw), member_fk, moment, moment + LIFETIME_SECONDS),
    )
    connection.commit()
    return raw


def holder(
    connection: sqlite3.Connection, raw: str, now: float | None = None
) -> sqlite3.Row | None:
    """The member a live token belongs to, without spending it."""
    if not raw or len(raw) > 128:
        return None
    moment = time.time() if now is None else now
    return connection.execute(
        "SELECT m.* FROM reset_tokens r JOIN members m ON m.id = r.member_fk"
        " WHERE r.id_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND m.is_active = 1",
        (_hash(raw), moment),
    ).fetchone()


def consume(connection: sqlite3.Connection, raw: str, now: float | None = None) -> int | None:
    """The member the token was issued for, marking it used; None if it is no good."""
    if not raw or len(raw) > 128:
        return None
    moment = time.time() if now is None else now
    digest = _hash(raw)
    cursor = connection.execute(
        "UPDATE reset_tokens SET used_at = ?"
        " WHERE id_hash = ? AND used_at IS NULL AND expires_at > ?",
        (moment, digest, moment),
    )
    connection.commit()
    if cursor.rowcount != 1:
        return None
    row = connection.execute(
        "SELECT member_fk FROM reset_tokens WHERE id_hash = ?", (digest,)
    ).fetchone()
    return int(row["member_fk"])
