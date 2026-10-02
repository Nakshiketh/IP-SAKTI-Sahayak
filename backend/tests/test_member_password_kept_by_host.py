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


def test_on_render_the_temporary_password_is_kept() -> None:
    from app.core.settings import Settings

    settings = Settings(DEMO_MEMBER_TEMP_PASSWORD="Temp-pass-for-tests-1", RENDER="true")
    assert settings.kept_member_password == "Temp-pass-for-tests-1"
    elsewhere = Settings(DEMO_MEMBER_TEMP_PASSWORD="Temp-pass-for-tests-1", RENDER="false")
    assert elsewhere.kept_member_password == ""


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


# -- with a database that outlives the disk -------------------------------------


@pytest.fixture
def kept_store(monkeypatch) -> dict[str, str]:
    """Stand in for the Postgres store: a dict, with DATABASE_URL set."""
    from app.auth import durable

    store: dict[str, str] = {}
    monkeypatch.setattr(get_settings(), "database_url", "postgresql://test")
    monkeypatch.setattr(get_settings(), "demo_member_password", KEPT)
    monkeypatch.setattr(durable, "load", store.get)
    monkeypatch.setattr(durable, "save", store.__setitem__)
    return store


@pytest.mark.real_auth
def test_forgot_password_works_and_the_new_one_is_kept(kept_store, outbox) -> None:
    from tests.conftest import code_from
    from tests.members import client_for, make_member

    member = make_member()
    c = client_for(app)
    sent = c.post(
        "/api/v1/auth/password/forgot",
        json={"identifier": member["username"], "email": f"{member['username']}@example.org"},
    )
    assert sent.status_code == 200
    (message,) = outbox
    verified = c.post(
        "/api/v1/auth/password/forgot/verify",
        json={"challengeId": sent.json()["challengeId"], "code": code_from(message)},
    )
    assert verified.status_code == 200
    new = "Fresh-Leaf-2026"
    done = c.post("/api/v1/auth/password/reset", json={"newPassword": new, "confirmPassword": new})
    assert done.status_code == 200, done.text
    assert verify_password(kept_store[member["member_id"]], new)


def test_a_wake_restores_the_kept_password(kept_store, tmp_path, monkeypatch) -> None:
    from app.auth import bootstrap
    from app.auth.hashing import hash_password

    kept_store[DEMO_MEMBER.member_id] = hash_password("Chosen-on-site-1")
    path = tmp_path / "woken.sqlite3"
    monkeypatch.setattr(bootstrap, "connect", lambda: connect(path))
    bootstrap.bootstrap_members()
    with connect(path) as fresh:
        row = member(fresh)
    assert row["must_change_password"] == 0
    assert verify_password(row["password_hash"], "Chosen-on-site-1")
    assert not verify_password(row["password_hash"], KEPT)


@pytest.mark.real_auth
def test_if_it_cannot_be_kept_nothing_changes(kept_store, monkeypatch) -> None:
    from app.auth import durable
    from tests.members import signed_in

    def down(*_: str) -> None:
        raise durable.DurableUnavailable("OperationalError")

    monkeypatch.setattr(durable, "save", down)
    client = signed_in(app)
    response = client.post(
        "/api/v1/auth/password/change",
        json={
            "currentPassword": "Correct-horse-1",
            "newPassword": "Fresh-Leaf-2026",
            "confirmPassword": "Fresh-Leaf-2026",
        },
    )
    assert response.status_code == 503
    assert response.json()["code"] == "password_not_kept"
