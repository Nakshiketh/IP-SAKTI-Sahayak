"""Members: the demo member's record, the seed that creates it, and the audit log."""

from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass

from app.auth.hashing import hash_password


@dataclass(frozen=True)
class MemberRecord:
    member_id: str
    name: str
    username: str
    email: str
    role: str
    institution: str


DEMO_MEMBER = MemberRecord(
    member_id="IPS-2026-0001",
    name="Nakshiketh",
    username="nakshiketh28",
    email="nakshiketh28@gmail.com",
    role="Student / Researcher",
    institution="MGIT",
)


class SeedRefused(RuntimeError):
    """The seed was asked to run without the temporary password it needs."""


def mask_email(email: str) -> str:
    """First and last character of the local part, one asterisk per hidden one.

    `nakshiketh28@gmail.com` becomes `n**********8@gmail.com`. A local part of
    one or two characters has nothing between its ends to hide, so it is masked
    entirely rather than shown whole.
    """
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        return "*" * len(local) + "@" + domain
    return local[0] + "*" * (len(local) - 2) + local[-1] + "@" + domain


def seed_demo_member(connection: sqlite3.Connection, temporary_password: str) -> bool:
    """Create the demo member if missing. Returns True if it was created.

    Idempotent: an existing member is left exactly as it is, password included,
    so running the seed again never undoes a password the member has set.
    """
    if not temporary_password:
        raise SeedRefused("DEMO_MEMBER_TEMP_PASSWORD is empty; set it in backend/.env.")

    member = DEMO_MEMBER
    exists = connection.execute(
        "SELECT 1 FROM members WHERE member_id = ?", (member.member_id,)
    ).fetchone()
    if exists:
        return False

    now = time.time()
    connection.execute(
        "INSERT INTO members (member_id, name, username, email, role, institution,"
        " password_hash, must_change_password, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        (
            member.member_id,
            member.name,
            member.username.lower(),
            member.email.lower(),
            member.role,
            member.institution,
            hash_password(temporary_password),
            now,
            now,
        ),
    )
    connection.commit()
    return True


def member_pk(connection: sqlite3.Connection, member_id: str) -> int | None:
    row = connection.execute(
        "SELECT id FROM members WHERE member_id = ? COLLATE NOCASE", (member_id,)
    ).fetchone()
    return None if row is None else int(row["id"])


def log_event(
    connection: sqlite3.Connection,
    event: str,
    member_fk: int | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> None:
    """One row in `auth_events`. Never pass a secret here: there is no field for one."""
    connection.execute(
        "INSERT INTO auth_events (member_fk, event, ip, user_agent, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (member_fk, event, ip, (user_agent or "")[:300] or None, time.time()),
    )
    connection.commit()
