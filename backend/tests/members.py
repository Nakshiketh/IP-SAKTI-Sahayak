"""Real members and real sessions, for tests about who may do what.

`conftest.py` signs ordinary feature tests in with a dependency override. Tests
that are about signing in, or that need two different members, use these
instead and are marked `real_auth`.
"""

from __future__ import annotations

import itertools
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth.hashing import hash_password
from app.auth.store import connect

#: Sent on every request by a signed-in test client, as the web app does.
CSRF = {"X-Sahayak-CSRF": "1"}

_numbers = itertools.count(1)


def make_member(
    username: str | None = None,
    password: str = "Correct-horse-1",
    *,
    must_change: bool = False,
    active: bool = True,
) -> dict[str, str]:
    """Insert a member into the test database. Returns its identifiers."""
    number = next(_numbers)
    username = (username or f"member{number}-{time.time_ns()}").lower()
    member_id = f"IPS-TEST-{number:04d}-{time.time_ns() % 100000}"
    now = time.time()
    with connect() as connection:
        connection.execute(
            "INSERT INTO members (member_id, name, username, email, role, institution,"
            " password_hash, must_change_password, is_active, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, 'Researcher', 'Test Institute', ?, ?, ?, ?, ?)",
            (
                member_id,
                f"Member {number}",
                username,
                f"{username}@example.org",
                hash_password(password),
                int(must_change),
                int(active),
                now,
                now,
            ),
        )
        connection.commit()
    return {"username": username, "member_id": member_id, "password": password}


def client_for(app: FastAPI) -> TestClient:
    """A client that sends the CSRF header, as the web app does, and keeps cookies."""
    return TestClient(app, headers=CSRF)


def signed_in(app: FastAPI, member: dict[str, str] | None = None) -> TestClient:
    """A client with a live session for `member` (a new one if not given)."""
    member = member or make_member()
    client = client_for(app)
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": member["username"], "password": member["password"]},
    )
    assert response.status_code == 200, response.text
    return client
