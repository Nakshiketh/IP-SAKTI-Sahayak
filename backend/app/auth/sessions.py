"""Server-side sessions: an opaque id in a cookie, a row in `sessions`.

The cookie carries 256 random bits and nothing else. The table stores an HMAC of
that id keyed with `SESSION_SECRET`, so a copy of the database cannot be turned
back into working cookies, and a leaked `SESSION_SECRET` alone opens nothing
either.

Two kinds of session:

* **Full**: 60 minutes idle, 12 hours absolute.
* **Restricted**: issued while the member still has a temporary password. It can
  read `/auth/me`, change the password and log out, and nothing else. It lasts
  10 minutes from issue and is never extended.

A session is never promoted in place. Changing the password revokes the
restricted session and issues a new full one, so an id that was ever handed out
under a temporary password never becomes a full session.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time

from app.core.settings import get_settings

COOKIE_NAME = "sahayak_session"

IDLE_SECONDS = 60 * 60
ABSOLUTE_SECONDS = 12 * 60 * 60
RESTRICTED_SECONDS = 10 * 60


def _id_hash(raw: str) -> str:
    secret = get_settings().session_secret
    if not secret:
        raise RuntimeError("SESSION_SECRET is not set.")
    return hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()


def create(
    connection: sqlite3.Connection,
    member_fk: int,
    *,
    restricted: bool,
    ip: str | None,
    user_agent: str | None,
    now: float | None = None,
) -> str:
    """Issue a new session and return its raw id, for the cookie only."""
    moment = time.time() if now is None else now
    raw = secrets.token_urlsafe(32)
    lifetime = RESTRICTED_SECONDS if restricted else ABSOLUTE_SECONDS
    connection.execute(
        "INSERT INTO sessions (id_hash, member_fk, restricted, created_at, last_seen_at,"
        " expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            _id_hash(raw),
            member_fk,
            int(restricted),
            moment,
            moment,
            moment + lifetime,
            (user_agent or "")[:300] or None,
            ip,
        ),
    )
    connection.commit()
    return raw


def lookup(
    connection: sqlite3.Connection, raw: str, now: float | None = None
) -> sqlite3.Row | None:
    """The live session and its member, or None. A hit counts as activity."""
    if not raw or len(raw) > 128:
        return None
    moment = time.time() if now is None else now
    row = connection.execute(
        "SELECT s.id_hash, s.restricted, s.last_seen_at, s.expires_at,"
        " m.id AS member_pk, m.member_id, m.name, m.username, m.role, m.institution"
        " FROM sessions s JOIN members m ON m.id = s.member_fk"
        " WHERE s.id_hash = ? AND s.revoked_at IS NULL AND m.is_active = 1",
        (_id_hash(raw),),
    ).fetchone()
    if row is None or moment >= row["expires_at"]:
        return None
    if not row["restricted"] and moment - row["last_seen_at"] >= IDLE_SECONDS:
        return None
    connection.execute(
        "UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?", (moment, row["id_hash"])
    )
    connection.commit()
    return row


def revoke(connection: sqlite3.Connection, raw: str) -> None:
    if not raw or len(raw) > 128:
        return
    connection.execute(
        "UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL",
        (time.time(), _id_hash(raw)),
    )
    connection.commit()


def revoke_all(connection: sqlite3.Connection, member_fk: int) -> int:
    """End every session the member has. Returns how many were live."""
    cursor = connection.execute(
        "UPDATE sessions SET revoked_at = ? WHERE member_fk = ? AND revoked_at IS NULL",
        (time.time(), member_fk),
    )
    connection.commit()
    return cursor.rowcount
