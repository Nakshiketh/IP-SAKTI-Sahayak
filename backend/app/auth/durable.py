"""Member passwords kept off the host's disk.

The free host wipes its disk whenever it sleeps, and the member table with it.
A password set through "forgot password" or a change would then be gone at the
next wake. Where DATABASE_URL names a Postgres database (any provider; the free
Neon plan does not expire), each new password's hash is written there too, and
read back over the seeded one when the server starts.

Only the argon2id hash is stored, never the password. With no DATABASE_URL
nothing here runs, and the local SQLite file is the only copy, as before.
"""

from __future__ import annotations

import time

from app.core.settings import get_settings

_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS member_passwords ("
    " member_id TEXT PRIMARY KEY,"
    " password_hash TEXT NOT NULL,"
    " changed_at DOUBLE PRECISION NOT NULL)"
)


class DurableUnavailable(RuntimeError):
    """The database could not be reached, so the password was not kept."""


def enabled() -> bool:
    return bool(get_settings().database_url)


def _connect():
    import psycopg

    try:
        connection = psycopg.connect(
            get_settings().database_url, connect_timeout=10, autocommit=True
        )
        connection.execute(_SCHEMA)
    except psycopg.Error as error:
        raise DurableUnavailable(type(error).__name__) from None
    return connection


def load(member_id: str) -> str | None:
    """The kept hash for this member, or None if none was ever kept."""
    import psycopg

    with _connect() as connection:
        try:
            row = connection.execute(
                "SELECT password_hash FROM member_passwords WHERE member_id = %s", (member_id,)
            ).fetchone()
        except psycopg.Error as error:
            raise DurableUnavailable(type(error).__name__) from None
    return None if row is None else row[0]


def save(member_id: str, password_hash: str) -> None:
    import psycopg

    with _connect() as connection:
        try:
            connection.execute(
                "INSERT INTO member_passwords (member_id, password_hash, changed_at)"
                " VALUES (%s, %s, %s) ON CONFLICT (member_id) DO UPDATE"
                " SET password_hash = EXCLUDED.password_hash, changed_at = EXCLUDED.changed_at",
                (member_id, password_hash, time.time()),
            )
        except psycopg.Error as error:
            raise DurableUnavailable(type(error).__name__) from None
