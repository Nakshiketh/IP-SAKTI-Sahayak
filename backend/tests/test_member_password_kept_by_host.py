"""A password the host keeps survives the free host wiping its disk.

On every wake the member table is empty and the seed runs again. With only the
temporary password, that sent the member to "create a new password" each time
and made the one they had chosen stop working. DEMO_MEMBER_PASSWORD fixes both.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.auth.hashing import verify_password
from app.auth.members import DEMO_MEMBER, seed_demo_member
from app.auth.store import connect
from app.core.settings import get_settings
from app.main import app
from tests.members import signed_in

KEPT = "Kept-by-host-pass-1"


@pytest.fixture
def db(tmp_path: Path) -> sqlite3.Connection:
    connection = connect(tmp_path / "accounts.sqlite3")
    yield connection
    connection.close()


def member(db: sqlite3.Connection) -> sqlite3.Row:
    return db.execute(
        "SELECT * FROM members WHERE member_id = ?", (DEMO_MEMBER.member_id,)
    ).fetchone()


def test_the_kept_password_needs_no_change(db: sqlite3.Connection) -> None:
    assert seed_demo_member(db, "Temp-pass-for-tests-1", KEPT)
    row = member(db)
    assert row["must_change_password"] == 0
    assert verify_password(row["password_hash"], KEPT)


def test_every_wake_seeds_the_same_password(tmp_path: Path) -> None:
    for wake in range(2):
        with connect(tmp_path / f"wake-{wake}.sqlite3") as fresh:
            seed_demo_member(fresh, "", KEPT)
            assert verify_password(member(fresh)["password_hash"], KEPT)


def test_without_it_the_temporary_password_must_still_be_changed(db) -> None:
    seed_demo_member(db, "Temp-pass-for-tests-1")
    assert member(db)["must_change_password"] == 1


@pytest.mark.real_auth
@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/v1/auth/password/forgot", {"identifier": "x", "email": "x@example.com"}),
        ("/api/v1/auth/password/reset", {"newPassword": "a", "confirmPassword": "a"}),
        ("/api/v1/auth/password/change", {"newPassword": "a", "confirmPassword": "a"}),
    ],
)
def test_the_site_does_not_offer_to_change_it(monkeypatch, path, body) -> None:
    client = signed_in(app)
    monkeypatch.setattr(get_settings(), "demo_member_password", KEPT)
    response = client.post(path, json=body)
    assert response.status_code == 409
    assert response.json()["code"] == "password_fixed"
