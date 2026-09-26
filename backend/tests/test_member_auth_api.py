"""Phase 2 of member authentication: sessions, password login, protection, logout.

Everything here runs against real sessions (`real_auth`), on the suite's
throwaway members database.
"""

from __future__ import annotations

import time

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.auth import sessions
from app.auth.bootstrap import bootstrap_members
from app.auth.members import DEMO_MEMBER
from app.auth.store import connect
from app.core.settings import get_settings
from app.main import MissingAuthSettings, app, create_app
from tests.members import CSRF, client_for, make_member, signed_in

pytestmark = pytest.mark.real_auth

NEW_PASSWORD = "Fresh-Leaf-2026"


def login(client: TestClient, identifier: str, password: str):
    return client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})


def session_rows(member_id: str) -> list:
    with connect() as connection:
        return connection.execute(
            "SELECT s.* FROM sessions s JOIN members m ON m.id = s.member_fk WHERE m.member_id = ?",
            (member_id,),
        ).fetchall()


# -- password login ------------------------------------------------------------


class TestLogin:
    def test_by_username_and_by_member_id_in_any_case(self) -> None:
        member = make_member()
        for identifier in (
            member["username"],
            member["username"].upper(),
            member["member_id"],
            member["member_id"].lower(),
        ):
            client = client_for(app)
            response = login(client, identifier, member["password"])
            assert response.status_code == 200, identifier
            assert response.json() == {"next": "dashboard"}

    def test_the_session_is_an_httponly_lax_cookie_and_not_in_the_body(self) -> None:
        member = make_member()
        response = login(client_for(app), member["username"], member["password"])
        cookie = response.headers["set-cookie"]
        assert cookie.startswith(f"{sessions.COOKIE_NAME}=")
        assert "HttpOnly" in cookie
        assert "SameSite=lax" in cookie
        assert "Path=/" in cookie
        # COOKIE_SECURE is false in tests, as in local development.
        assert "Secure" not in cookie
        raw = cookie.split(";", 1)[0].split("=", 1)[1]
        assert raw not in response.text

    def test_only_a_hash_of_the_session_id_is_stored(self) -> None:
        member = make_member()
        client = client_for(app)
        login(client, member["username"], member["password"])
        raw = client.cookies.get(sessions.COOKIE_NAME)
        stored = [row["id_hash"] for row in session_rows(member["member_id"])]
        assert raw not in stored and len(stored) == 1

    def test_the_secure_flag_follows_cookie_secure(self, monkeypatch) -> None:
        member = make_member()
        monkeypatch.setattr(get_settings(), "cookie_secure", True)
        response = login(client_for(app), member["username"], member["password"])
        assert "Secure" in response.headers["set-cookie"]

    def test_unknown_user_and_wrong_password_read_the_same(self) -> None:
        member = make_member()
        wrong = login(client_for(app), member["username"], "Not-the-password-1")
        unknown = login(client_for(app), "nobody-at-all", "Not-the-password-1")
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json() == unknown.json()
        assert wrong.json()["message"] == "Member ID/username or password is incorrect."

    def test_an_unknown_user_still_costs_a_hash_verification(self, monkeypatch) -> None:
        from app.api import auth

        calls: list[object] = []
        real = auth.verify_password
        monkeypatch.setattr(auth, "verify_password", lambda h, p: calls.append(h) or real(h, p))
        login(client_for(app), "nobody-at-all", "whatever")
        assert calls == [None]

    def test_an_inactive_member_gets_the_generic_answer(self) -> None:
        member = make_member(active=False)
        response = login(client_for(app), member["username"], member["password"])
        assert response.status_code == 401
        assert response.json()["code"] == "invalid_credentials"

    def test_five_failures_lock_the_account_for_fifteen_minutes(self) -> None:
        member = make_member()
        client = client_for(app)
        for _ in range(4):
            assert login(client, member["username"], "Wrong-pass-1").status_code == 401
        fifth = login(client, member["username"], "Wrong-pass-1")
        assert fifth.status_code == 423
        assert fifth.json()["message"] == (
            "Too many failed attempts. Try again in 15 minutes, or reset your password."
        )
        # Even the right password is refused while locked.
        assert login(client, member["username"], member["password"]).status_code == 423
        with connect() as connection:
            locked_until = connection.execute(
                "SELECT locked_until FROM members WHERE username = ?", (member["username"],)
            ).fetchone()[0]
        assert 14 * 60 < locked_until - time.time() <= 15 * 60

    def test_a_lock_expires(self) -> None:
        member = make_member()
        with connect() as connection:
            connection.execute(
                "UPDATE members SET locked_until = ? WHERE username = ?",
                (time.time() - 1, member["username"]),
            )
            connection.commit()
        assert login(client_for(app), member["username"], member["password"]).status_code == 200

    def test_success_resets_the_failure_count(self) -> None:
        member = make_member()
        client = client_for(app)
        for _ in range(4):
            login(client, member["username"], "Wrong-pass-1")
        assert login(client, member["username"], member["password"]).status_code == 200
        with connect() as connection:
            row = connection.execute(
                "SELECT failed_login_count, last_login_at FROM members WHERE username = ?",
                (member["username"],),
            ).fetchone()
        assert row["failed_login_count"] == 0 and row["last_login_at"] is not None

    def test_twenty_attempts_a_minute_per_address(self) -> None:
        client = client_for(app)
        for _ in range(20):
            login(client, "nobody-at-all", "whatever")
        response = login(client, "nobody-at-all", "whatever")
        assert response.status_code == 429

    def test_a_new_session_id_on_every_login(self) -> None:
        member = make_member()
        client = client_for(app)
        login(client, member["username"], member["password"])
        first = client.cookies.get(sessions.COOKIE_NAME)
        login(client, member["username"], member["password"])
        second = client.cookies.get(sessions.COOKIE_NAME)
        assert first != second
        # The session this browser had before is over.
        live = [row for row in session_rows(member["member_id"]) if row["revoked_at"] is None]
        assert len(live) == 1

    def test_events_are_logged_and_carry_no_secret(self) -> None:
        member = make_member()
        client = client_for(app)
        login(client, member["username"], "Wrong-pass-1")
        login(client, member["username"], member["password"])
        with connect() as connection:
            rows = connection.execute(
                "SELECT e.* FROM auth_events e JOIN members m ON m.id = e.member_fk"
                " WHERE m.username = ? ORDER BY e.id",
                (member["username"],),
            ).fetchall()
        assert [row["event"] for row in rows] == ["login_failed", "login_success"]
        text = repr([dict(row) for row in rows])
        assert member["password"] not in text and "Wrong-pass-1" not in text


# -- restricted sessions and changing the password -----------------------------


class TestTemporaryPassword:
    def test_a_temporary_password_opens_a_restricted_session(self) -> None:
        member = make_member(must_change=True)
        client = client_for(app)
        assert login(client, member["username"], member["password"]).json() == {
            "next": "change-password"
        }
        me = client.get("/api/v1/auth/me").json()
        assert me["restricted"] is True
        assert set(me) == {"name", "role", "institution", "memberId", "restricted"}

    def test_a_restricted_session_cannot_reach_the_app(self) -> None:
        member = make_member(must_change=True)
        client = client_for(app)
        login(client, member["username"], member["password"])
        query = client.post("/api/v1/query", json={"question": "Can I patent a churna?"})
        assert query.status_code == 403
        assert query.json()["code"] == "password_change_required"
        assert client.get("/api/v1/sources").status_code == 403
        assert client.get("/api/v1/analyst/conversations").status_code == 403

    def test_a_restricted_session_lasts_ten_minutes(self) -> None:
        member = make_member(must_change=True)
        client = client_for(app)
        login(client, member["username"], member["password"])
        (row,) = session_rows(member["member_id"])
        assert row["expires_at"] - row["created_at"] == sessions.RESTRICTED_SECONDS

    def test_changing_it_upgrades_to_a_full_session_with_a_new_id(self) -> None:
        member = make_member(must_change=True)
        client = client_for(app)
        login(client, member["username"], member["password"])
        restricted_id = client.cookies.get(sessions.COOKIE_NAME)
        response = client.post(
            "/api/v1/auth/password/change",
            json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
        )
        assert response.status_code == 200, response.text
        assert response.json() == {"next": "dashboard"}
        assert client.cookies.get(sessions.COOKIE_NAME) != restricted_id
        assert client.get("/api/v1/auth/me").json()["restricted"] is False
        assert client.get("/api/v1/sources").status_code == 200
        # The old password no longer works; the new one does, with no restriction.
        assert login(client_for(app), member["username"], member["password"]).status_code == 401
        assert login(client_for(app), member["username"], NEW_PASSWORD).json() == {
            "next": "dashboard"
        }

    @pytest.mark.parametrize(
        ("new", "confirm", "code"),
        [
            ("Short1a", "Short1a", "password_length"),
            ("x" * 120 + "Aa1" + "y" * 10, "x" * 120 + "Aa1" + "y" * 10, "password_length"),
            ("alllowercase1", "alllowercase1", "password_uppercase"),
            ("ALLUPPERCASE1", "ALLUPPERCASE1", "password_lowercase"),
            ("NoNumbersHere", "NoNumbersHere", "password_number"),
            (NEW_PASSWORD, NEW_PASSWORD + "x", "password_mismatch"),
        ],
    )
    def test_the_rules_are_enforced_on_the_server(self, new: str, confirm: str, code: str) -> None:
        member = make_member(must_change=True)
        client = client_for(app)
        login(client, member["username"], member["password"])
        response = client.post(
            "/api/v1/auth/password/change", json={"newPassword": new, "confirmPassword": confirm}
        )
        assert response.status_code == 422
        assert response.json()["code"] == code

    def test_it_cannot_be_the_temporary_password_or_an_identifier(self) -> None:
        member = make_member(username="Casey2026x", password="Temp-Pass-99", must_change=True)
        client = client_for(app)
        login(client, member["username"], member["password"])
        for new, code in (
            ("Temp-Pass-99", "password_unchanged"),
            ("Casey2026x", "password_is_identifier"),
        ):
            response = client.post(
                "/api/v1/auth/password/change", json={"newPassword": new, "confirmPassword": new}
            )
            assert response.json()["code"] == code, new

    def test_a_full_session_must_give_the_current_password(self) -> None:
        member = make_member()
        client = signed_in(app, member)
        body = {"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD}
        refused = client.post("/api/v1/auth/password/change", json=body)
        assert refused.status_code == 400
        assert refused.json()["code"] == "current_password_incorrect"
        accepted = client.post(
            "/api/v1/auth/password/change",
            json={**body, "currentPassword": member["password"]},
        )
        assert accepted.status_code == 200

    def test_changing_it_ends_every_other_session(self) -> None:
        member = make_member()
        elsewhere = signed_in(app, member)
        here = signed_in(app, member)
        here.post(
            "/api/v1/auth/password/change",
            json={
                "currentPassword": member["password"],
                "newPassword": NEW_PASSWORD,
                "confirmPassword": NEW_PASSWORD,
            },
        )
        assert elsewhere.get("/api/v1/auth/me").status_code == 401
        assert here.get("/api/v1/auth/me").status_code == 200


# -- sessions ------------------------------------------------------------------


class TestSessions:
    def test_idle_for_an_hour_ends_a_full_session(self) -> None:
        member = make_member()
        client = signed_in(app, member)
        with connect() as connection:
            connection.execute(
                "UPDATE sessions SET last_seen_at = last_seen_at - ?",
                (sessions.IDLE_SECONDS + 1,),
            )
            connection.commit()
        assert client.get("/api/v1/auth/me").status_code == 401

    def test_twelve_hours_ends_it_regardless(self) -> None:
        member = make_member()
        client = signed_in(app, member)
        with connect() as connection:
            connection.execute("UPDATE sessions SET expires_at = ?", (time.time() - 1,))
            connection.commit()
        assert client.get("/api/v1/auth/me").status_code == 401
        (row,) = session_rows(member["member_id"])
        assert row["expires_at"] - row["created_at"] <= sessions.ABSOLUTE_SECONDS

    def test_a_forged_cookie_opens_nothing(self) -> None:
        client = client_for(app)
        client.cookies.set(sessions.COOKIE_NAME, "made-up-value")
        assert client.get("/api/v1/auth/me").status_code == 401

    def test_nothing_about_the_session_is_readable_from_me(self) -> None:
        client = signed_in(app)
        body = client.get("/api/v1/auth/me").text
        assert client.cookies.get(sessions.COOKIE_NAME) not in body


# -- logout --------------------------------------------------------------------


class TestLogout:
    def test_logout_ends_the_session_on_the_server(self) -> None:
        member = make_member()
        client = signed_in(app, member)
        raw = client.cookies.get(sessions.COOKIE_NAME)
        response = client.post("/api/v1/auth/logout")
        assert response.status_code == 204
        assert f'{sessions.COOKIE_NAME}=""' in response.headers["set-cookie"]
        # Replaying the old cookie does not bring it back.
        replay = client_for(app)
        replay.cookies.set(sessions.COOKIE_NAME, raw)
        assert replay.get("/api/v1/auth/me").status_code == 401
        assert replay.get("/api/v1/sources").status_code == 401

    def test_logout_without_a_session_is_harmless(self) -> None:
        assert client_for(app).post("/api/v1/auth/logout").status_code == 204


# -- CSRF ----------------------------------------------------------------------


class TestCsrf:
    def test_a_state_change_without_the_header_is_refused(self) -> None:
        member = make_member()
        bare = TestClient(app)
        response = bare.post(
            "/api/v1/auth/login",
            json={"identifier": member["username"], "password": member["password"]},
        )
        assert response.status_code == 403
        assert response.json()["code"] == "csrf_failed"

    def test_a_signed_in_post_without_the_header_is_refused(self) -> None:
        client = signed_in(app)
        response = client.post("/api/v1/feedback", json={}, headers={"X-Sahayak-CSRF": ""})
        assert response.status_code == 403

    def test_a_foreign_origin_is_refused(self) -> None:
        member = make_member()
        response = client_for(app).post(
            "/api/v1/auth/login",
            headers={"Origin": "https://evil.example"},
            json={"identifier": member["username"], "password": member["password"]},
        )
        assert response.status_code == 403

    def test_the_app_origin_is_accepted(self) -> None:
        member = make_member()
        response = client_for(app).post(
            "/api/v1/auth/login",
            headers={"Origin": "http://localhost:5173"},
            json={"identifier": member["username"], "password": member["password"]},
        )
        assert response.status_code == 200

    def test_cors_never_allows_every_origin_with_credentials(self) -> None:
        response = TestClient(app).options(
            "/api/v1/auth/me",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )
        assert response.headers.get("access-control-allow-origin") != "*"
        assert response.headers.get("access-control-allow-origin") != "https://evil.example"


# -- every route is protected --------------------------------------------------

#: The only routes a request without a session may reach.
OPEN = {
    ("GET", "/api/v1/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/qr/verify"),
    ("POST", "/api/v1/auth/otp/resend"),
    ("POST", "/api/v1/auth/otp/verify"),
    ("POST", "/api/v1/auth/password/forgot"),
    ("POST", "/api/v1/auth/password/forgot/verify"),
    ("POST", "/api/v1/auth/password/reset"),
    ("POST", "/api/v1/auth/logout"),
}


def _api_routes(routes):
    """Every API route, including those inside included routers.

    FastAPI 0.14x wraps an included router rather than copying its routes into
    the app, so the wrapper's `original_router` is walked too. The routers here
    carry their prefix themselves, so each route's path is already complete.
    """
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        inner = getattr(route, "original_router", None)
        if inner is not None:
            yield from _api_routes(inner.routes)


def every_route():
    for route in _api_routes(app.routes):
        for method in route.methods - {"HEAD", "OPTIONS"}:
            yield method, route.path


def test_the_walk_finds_the_routes() -> None:
    """Guard for the test below: an empty walk would make it pass vacuously."""
    found = set(every_route())
    assert ("POST", "/api/v1/query") in found
    assert ("GET", "/api/v1/sources") in found
    assert len(found) > 30


class TestProtection:
    def test_the_old_routes_are_gone(self) -> None:
        paths = {path for _, path in every_route()}
        assert "/api/v1/auth/register" not in paths

    @pytest.mark.parametrize(("method", "path"), sorted(set(every_route()) - OPEN))
    def test_no_route_answers_without_a_session(self, method: str, path: str) -> None:
        concrete = path.replace("{", "").replace("}", "")
        response = TestClient(app).request(method, concrete, headers=CSRF)
        # The session check runs before anything else, feature flags included.
        assert response.status_code == 401, f"{method} {path}: {response.status_code}"

    def test_the_answer_engine_in_particular(self) -> None:
        response = TestClient(app).post(
            "/api/v1/query", json={"question": "Can I patent a churna?"}, headers=CSRF
        )
        assert response.status_code == 401

    def test_health_stays_open(self) -> None:
        assert TestClient(app).get("/api/v1/health").status_code == 200


# -- startup -------------------------------------------------------------------


class TestStartup:
    def test_missing_secrets_stop_the_server_and_are_named_not_shown(self, monkeypatch) -> None:
        settings = get_settings()
        monkeypatch.setattr(settings, "session_secret", "")
        monkeypatch.setattr(settings, "otp_secret", "zq7-not-long")
        with pytest.raises(MissingAuthSettings) as raised:
            create_app()
        message = str(raised.value)
        assert "SESSION_SECRET" in message and "OTP_SECRET" in message
        assert "zq7-not-long" not in message

    def test_bootstrap_seeds_the_demo_member_and_its_card(self, monkeypatch) -> None:
        monkeypatch.setattr(get_settings(), "demo_member_temp_password", "Temp-Boot-1")
        bootstrap_members()
        bootstrap_members()
        with connect() as connection:
            member = connection.execute(
                "SELECT * FROM members WHERE member_id = ?", (DEMO_MEMBER.member_id,)
            ).fetchone()
            cards = connection.execute(
                "SELECT * FROM member_qr_tokens WHERE member_fk = ?", (member["id"],)
            ).fetchall()
        assert member["must_change_password"] == 1
        assert len(cards) >= 1

    def test_bootstrap_does_nothing_without_the_variable(self, monkeypatch) -> None:
        monkeypatch.setattr(get_settings(), "demo_member_temp_password", "")
        bootstrap_members()  # must not raise
