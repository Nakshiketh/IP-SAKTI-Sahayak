"""Phase 7: the brief's acceptance cases A-K, one test each, by letter.

Several are also covered in more detail elsewhere (noted per case); here each
is stated once, end to end, over the API, so the list can be checked against
the brief line by line. Email is captured by the `outbox` fixture, which exists
only in a test run (`conftest.py`).
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth import cards, reset, sessions
from app.auth.store import connect
from app.core.settings import REPO_ROOT
from app.main import app
from tests.conftest import code_from
from tests.members import CSRF, make_member

pytestmark = pytest.mark.real_auth

NEW_PASSWORD = "Fresh-Leaf-2026"


def client() -> TestClient:
    return TestClient(app, headers=CSRF)


def card_png(tmp_path: Path) -> bytes:
    """The image `issue-card` writes: the card, as the member holds it."""
    return cards.render_badge_png(tmp_path / "card.png").read_bytes()


def scan(c: TestClient, image: bytes, content_type: str = "image/png"):
    return c.post("/api/v1/auth/qr/verify", content=image, headers={"Content-Type": content_type})


def holder(must_change: bool = False) -> dict[str, str]:
    member = make_member(must_change=must_change)
    with connect() as connection:
        cards.issue_card(connection, member["member_id"])
    return member


def login(c: TestClient, identifier: str, password: str):
    return c.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})


def forgot(c: TestClient, identifier: str, address: str):
    return c.post("/api/v1/auth/password/forgot", json={"identifier": identifier, "email": address})


# -- A ---------------------------------------------------------------------------


def test_A_qr_login_end_to_end(tmp_path, outbox) -> None:
    """Card image -> verify -> code emailed -> code -> first-login change -> dashboard."""
    member = holder(must_change=True)
    c = client()

    scanned = scan(c, card_png(tmp_path))
    assert scanned.status_code == 200
    body = scanned.json()
    assert body["member"]["memberId"] == member["member_id"]
    assert c.get("/api/v1/sources").status_code == 401  # the card alone opens nothing

    (message,) = outbox
    verified = c.post(
        "/api/v1/auth/otp/verify",
        json={"challengeId": body["challengeId"], "code": code_from(message)},
    )
    assert verified.json() == {"next": "change-password"}
    assert c.get("/api/v1/sources").status_code == 403  # restricted until the change

    changed = c.post(
        "/api/v1/auth/password/change",
        json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
    )
    assert changed.json() == {"next": "dashboard"}
    assert c.get("/api/v1/auth/me").json()["restricted"] is False
    assert c.get("/api/v1/sources").status_code == 200


# -- B ---------------------------------------------------------------------------


@pytest.mark.parametrize("by", ["username", "member_id"])
def test_B_password_login_with_username_and_with_member_id(by: str) -> None:
    member = make_member()
    response = login(client(), member[by], member["password"])
    assert response.json() == {"next": "dashboard"}


# -- C ---------------------------------------------------------------------------


def test_C_forgot_password_then_the_new_password_works_and_the_old_fails(outbox) -> None:
    member = make_member()
    c = client()
    challenge = forgot(c, member["username"], f"{member['username']}@example.org").json()
    c.post(
        "/api/v1/auth/password/forgot/verify",
        json={"challengeId": challenge["challengeId"], "code": code_from(outbox[0])},
    )
    assert (
        c.post(
            "/api/v1/auth/password/reset",
            json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
        ).status_code
        == 200
    )
    assert login(client(), member["username"], member["password"]).status_code == 401
    assert login(client(), member["username"], NEW_PASSWORD).status_code == 200


# -- D ---------------------------------------------------------------------------


def test_D_wrong_codes_are_rejected_until_the_code_locks(tmp_path, outbox) -> None:
    holder()
    c = client()
    challenge = scan(c, card_png(tmp_path)).json()["challengeId"]
    right = code_from(outbox[0])
    wrong = f"{(int(right) + 1) % 1_000_000:06d}"
    remaining = []
    for _ in range(4):
        response = c.post("/api/v1/auth/otp/verify", json={"challengeId": challenge, "code": wrong})
        assert response.json()["code"] == "OTP_INCORRECT"
        remaining.append(response.json()["attemptsRemaining"])
    assert remaining == [4, 3, 2, 1]
    locked = c.post("/api/v1/auth/otp/verify", json={"challengeId": challenge, "code": wrong})
    assert locked.json()["code"] == "OTP_LOCKED"
    # The right code no longer works either.
    after = c.post("/api/v1/auth/otp/verify", json={"challengeId": challenge, "code": right})
    assert after.json()["code"] == "OTP_LOCKED"


# -- E ---------------------------------------------------------------------------


def test_E_an_expired_code_is_rejected(tmp_path, outbox) -> None:
    holder()
    c = client()
    challenge = scan(c, card_png(tmp_path)).json()["challengeId"]
    with connect() as connection:  # five minutes and one second later
        connection.execute(
            "UPDATE otp_codes SET expires_at = expires_at - 301, created_at = created_at - 301"
            " WHERE challenge_fk = ?",
            (challenge,),
        )
        connection.commit()
    response = c.post(
        "/api/v1/auth/otp/verify", json={"challengeId": challenge, "code": code_from(outbox[0])}
    )
    assert response.json()["code"] == "OTP_EXPIRED"


# -- F ---------------------------------------------------------------------------


def test_F_unrelated_qr_malformed_input_and_revoked_card_are_refused(tmp_path, outbox) -> None:
    import cv2

    member = holder()
    c = client()

    other = cv2.QRCodeEncoder.create().encode("IPSAKTI:v1:not-a-member-card")
    other = cv2.resize(other, None, fx=10, fy=10, interpolation=cv2.INTER_NEAREST)
    unrelated = scan(c, cv2.imencode(".png", other)[1].tobytes())
    assert unrelated.status_code == 403 and unrelated.json()["code"] == "QR_INVALID"

    assert scan(c, b"not an image at all").status_code == 422
    assert scan(c, b'{"payload": "IPSAKTI:v1:x"}', "application/json").status_code == 415

    with connect() as connection:
        cards.revoke_card(connection, member["member_id"], "lost")
    revoked = scan(c, card_png(tmp_path))
    assert revoked.status_code == 403 and revoked.json()["code"] == "QR_REVOKED"
    assert outbox == []  # none of these sent a code


# -- G ---------------------------------------------------------------------------


def test_G_logout_ends_the_session_everywhere() -> None:
    member = make_member()
    c = client()
    login(c, member["username"], member["password"])
    stale = c.cookies.get(sessions.COOKIE_NAME)
    assert c.post("/api/v1/auth/logout").status_code == 204

    replay = client()
    replay.cookies.set(sessions.COOKIE_NAME, stale)
    assert replay.get("/api/v1/auth/me").status_code == 401
    assert replay.get("/api/v1/sources").status_code == 401
    assert replay.post("/api/v1/query", json={"text": "Can I patent a churna?"}).status_code == 401
    # Dashboard pages: the web app redirects to /login on the 401 from /auth/me
    # (frontend `routes/auth.gate.test.tsx`).


# -- H ---------------------------------------------------------------------------


def test_H_forgot_password_answers_are_identical_for_matches_and_misses(outbox) -> None:
    member = make_member()
    match = forgot(client(), member["username"], f"{member['username']}@example.org")
    miss = forgot(client(), "no-such-member", "nobody@example.org")
    assert match.status_code == miss.status_code == 200
    strip = lambda body: {**body, "challengeId": len(body["challengeId"])}  # noqa: E731
    assert strip(match.json()) == strip(miss.json())
    assert sorted(match.headers) == sorted(miss.headers)


# -- I ---------------------------------------------------------------------------


def test_I_rate_limits_and_lockouts_trigger(tmp_path, outbox) -> None:
    # Account lockout: five wrong passwords.
    member = make_member()
    c = client()
    for _ in range(4):
        login(c, member["username"], "Wrong-pass-1")
    assert login(c, member["username"], "Wrong-pass-1").status_code == 423

    # Password login: 20 a minute per address (4+1 above, 15 more, then 429).
    for _ in range(15):
        login(c, "nobody", "whatever")
    assert login(c, "nobody", "whatever").status_code == 429

    # Code sends: 5 an hour per member.
    holder()
    scanner = client()
    for _ in range(5):
        assert scan(scanner, card_png(tmp_path)).status_code == 200
    assert scan(scanner, card_png(tmp_path)).json()["code"] == "OTP_SEND_LIMIT"

    # Forgot password: 3 an hour per identifier.
    for _ in range(3):
        forgot(client(), "ghost", "g@x.org")
    assert forgot(client(), "ghost", "g@x.org").status_code == 429


# -- J ---------------------------------------------------------------------------


def test_J_a_restricted_session_is_refused_the_answer_engine_and_the_analyst() -> None:
    member = make_member(must_change=True)
    c = client()
    login(c, member["username"], member["password"])
    for method, path, body in (
        ("POST", "/api/v1/query", {"text": "Can I patent a churna?"}),
        ("GET", "/api/v1/sources", None),
        ("POST", "/api/v1/classify", {}),
        ("GET", "/api/v1/analyst/conversations", None),
        ("POST", "/api/v1/analyst/conversations", None),
        ("POST", "/api/v1/documents/read", None),
    ):
        response = c.request(method, path, json=body)
        assert response.status_code == 403, f"{method} {path}"
        assert response.json()["code"] == "password_change_required"


# -- K ---------------------------------------------------------------------------


def test_K_a_password_change_ends_every_other_session() -> None:
    member = make_member()
    phone, laptop = client(), client()
    login(phone, member["username"], member["password"])
    login(laptop, member["username"], member["password"])
    laptop.post(
        "/api/v1/auth/password/change",
        json={
            "currentPassword": member["password"],
            "newPassword": NEW_PASSWORD,
            "confirmPassword": NEW_PASSWORD,
        },
    )
    assert phone.get("/api/v1/auth/me").status_code == 401
    assert laptop.get("/api/v1/auth/me").status_code == 200


# -- hardening -------------------------------------------------------------------


def test_no_secret_reaches_a_log_or_the_console(tmp_path, outbox, caplog, capsys) -> None:
    """Every flow once, with logging at DEBUG, then look for each secret it touched."""
    caplog.set_level(logging.DEBUG)
    member = holder(must_change=True)
    c = client()

    challenge = scan(c, card_png(tmp_path)).json()["challengeId"]
    login_code = code_from(outbox[-1])
    c.post("/api/v1/auth/otp/verify", json={"challengeId": challenge, "code": login_code})
    session_id = c.cookies.get(sessions.COOKIE_NAME)
    c.post(
        "/api/v1/auth/password/change",
        json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
    )
    c.post("/api/v1/auth/logout")

    r = client()
    reset_challenge = forgot(r, member["username"], f"{member['username']}@example.org").json()
    reset_code = code_from(outbox[-1])
    r.post(
        "/api/v1/auth/password/forgot/verify",
        json={"challengeId": reset_challenge["challengeId"], "code": reset_code},
    )
    reset_token = r.cookies.get(reset.COOKIE_NAME)
    login(client(), member["username"], "A-wrong-password-9")

    printed = capsys.readouterr()
    everything = caplog.text + printed.out + printed.err
    with connect() as connection:
        events = repr([dict(row) for row in connection.execute("SELECT * FROM auth_events")])
    for secret in (
        member["password"],
        NEW_PASSWORD,
        "A-wrong-password-9",
        login_code,
        reset_code,
        session_id,
        reset_token,
        cards.BADGE_TOKEN,
    ):
        assert secret and secret not in everything, "secret in logs"
        assert secret not in events, "secret in auth_events"


def test_the_application_has_no_test_email_switch_or_code_fallback() -> None:
    """The captured-email fixture lives in tests/ only; app/ has nothing like it."""
    app_dir = REPO_ROOT / "backend" / "app"
    source = "\n".join(p.read_text("utf-8") for p in app_dir.rglob("*.py"))
    for word in ("outbox", "fake_email", "mock_email", "DEBUG_OTP", "OTP_FALLBACK"):
        assert word not in source, word
    # No code is ever printed: the only print() calls in app/auth are the CLI's.
    for path in (app_dir / "auth").glob("*.py"):
        if path.name != "cli.py":
            assert not re.search(r"\bprint\(", path.read_text("utf-8")), path.name


def test_otp_generation_uses_the_secure_generator() -> None:
    source = (REPO_ROOT / "backend" / "app" / "auth" / "otp.py").read_text("utf-8")
    assert "secrets.randbelow(1_000_000)" in source
    assert "import random" not in source


def test_timing_of_unknown_and_known_identifiers_is_comparable() -> None:
    """An unknown identifier costs a full argon2 verify, like a wrong password."""
    member = make_member()
    samples = {"known": [], "unknown": []}
    for _ in range(3):
        for kind, identifier in (("known", member["username"]), ("unknown", "no-such-member")):
            start = time.perf_counter()
            login(client(), identifier, "Wrong-pass-1")
            samples[kind].append(time.perf_counter() - start)
    known, unknown = min(samples["known"]), min(samples["unknown"])
    # Same order of magnitude: both run argon2. Without the dummy verify the
    # unknown path would be ~100x faster.
    assert unknown > known / 3
