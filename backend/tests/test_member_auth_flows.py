"""Phase 4 of member authentication: QR sign-in with an emailed code, and forgot password.

Every success and error path, over the API, with email captured by the
`outbox` fixture (tests only).
"""

from __future__ import annotations

import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.auth import cards, email, reset, sessions
from app.auth.store import connect
from app.core import badge
from app.main import app
from tests.conftest import code_from
from tests.members import CSRF, make_member

pytestmark = pytest.mark.real_auth

NEW_PASSWORD = "Fresh-Leaf-2026"


def frame() -> bytes:
    grid = np.array([[cell == "#" for cell in row] for row in badge.BADGE])
    pixels = np.where(np.pad(grid, 4), 0, 255).astype(np.uint8)
    pixels = np.kron(pixels, np.ones((10, 10), dtype=np.uint8))
    return cv2.imencode(".jpg", pixels, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()


def client() -> TestClient:
    return TestClient(app, headers=CSRF)


@pytest.fixture
def holder(outbox) -> dict[str, str]:
    member = make_member()
    with connect() as connection:
        cards.issue_card(connection, member["member_id"])
    return member


def scan(c: TestClient):
    return c.post("/api/v1/auth/qr/verify", content=frame(), headers={"Content-Type": "image/jpeg"})


def verify(c: TestClient, challenge: str, code: str):
    return c.post("/api/v1/auth/otp/verify", json={"challengeId": challenge, "code": code})


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def age_codes(challenge: str, seconds: float) -> None:
    """Move a challenge's codes (and the challenge) `seconds` into the past."""
    with connect() as connection:
        connection.execute(
            "UPDATE otp_codes SET created_at = created_at - ?, expires_at = expires_at - ?"
            " WHERE challenge_fk = ?",
            (seconds, seconds, challenge),
        )
        connection.execute(
            "UPDATE auth_challenges SET created_at = created_at - ?, expires_at = expires_at - ?"
            " WHERE id = ?",
            (seconds, seconds, challenge),
        )
        connection.commit()


# -- QR sign-in ----------------------------------------------------------------


class TestQrSignIn:
    def test_scan_code_session(self, holder, outbox) -> None:
        c = client()
        body = scan(c).json()
        assert body["member"]["name"] and body["member"]["memberId"] == holder["member_id"]
        assert body["resendAvailableAt"] > time.time() + 50
        response = verify(c, body["challengeId"], code_from(outbox[0]))
        assert response.json() == {"next": "dashboard"}
        assert c.get("/api/v1/sources").status_code == 200

    def test_nothing_about_the_member_is_taken_from_the_request(self, holder, outbox) -> None:
        response = client().post(
            "/api/v1/auth/qr/verify?memberId=IPS-2026-0001",
            content=frame(),
            headers={"Content-Type": "image/jpeg", "X-Member-Id": "someone-else"},
        )
        assert response.json()["member"]["memberId"] == holder["member_id"]

    def test_incorrect_codes_say_how_many_attempts_are_left(self, holder, outbox) -> None:
        c = client()
        challenge = scan(c).json()["challengeId"]
        bad = wrong(code_from(outbox[0]))
        first = verify(c, challenge, bad)
        assert first.status_code == 400
        assert first.json() == {
            "code": "OTP_INCORRECT",
            "message": "That code is incorrect. 4 attempts left.",
            "attemptsRemaining": 4,
        }
        verify(c, challenge, bad)
        third = verify(c, challenge, bad)
        assert third.json()["message"] == "That code is incorrect. 2 attempts left."
        fourth = verify(c, challenge, bad)
        assert fourth.json()["message"] == "That code is incorrect. 1 attempt left."

    def test_five_wrong_codes_lock_it(self, holder, outbox) -> None:
        c = client()
        challenge = scan(c).json()["challengeId"]
        code = code_from(outbox[0])
        for _ in range(4):
            verify(c, challenge, wrong(code))
        locked = verify(c, challenge, wrong(code))
        assert locked.json()["code"] == "OTP_LOCKED"
        assert locked.json()["message"] == (
            "Too many incorrect attempts. Scan your Member ID again to get a new code."
        )
        assert verify(c, challenge, code).json()["code"] == "OTP_LOCKED"
        assert c.get("/api/v1/auth/me").status_code == 401

    def test_an_expired_code(self, holder, outbox) -> None:
        c = client()
        challenge = scan(c).json()["challengeId"]
        code = code_from(outbox[0])
        with connect() as connection:
            connection.execute(
                "UPDATE otp_codes SET expires_at = ? WHERE challenge_fk = ?",
                (time.time() - 1, challenge),
            )
            connection.commit()
        response = verify(c, challenge, code)
        assert response.json() == {
            "code": "OTP_EXPIRED",
            "message": "This code has expired. Request a new one.",
        }

    def test_an_expired_challenge(self, holder, outbox) -> None:
        c = client()
        challenge = scan(c).json()["challengeId"]
        code = code_from(outbox[0])
        age_codes(challenge, 601)
        assert verify(c, challenge, code).json()["code"] == "CHALLENGE_EXPIRED"

    def test_an_unknown_challenge(self, holder) -> None:
        assert verify(client(), "made-up", "123456").json()["code"] == "CHALLENGE_EXPIRED"

    def test_resend_replaces_the_code_after_the_cooldown(self, holder, outbox) -> None:
        c = client()
        challenge = scan(c).json()["challengeId"]
        first = code_from(outbox[0])
        early = c.post("/api/v1/auth/otp/resend", json={"challengeId": challenge})
        assert early.status_code == 429
        assert early.json()["code"] == "OTP_COOLDOWN" and early.json()["retryAfter"] > 0
        age_codes(challenge, 61)
        again = c.post("/api/v1/auth/otp/resend", json={"challengeId": challenge})
        assert again.status_code == 200 and "resendAvailableAt" in again.json()
        second = code_from(outbox[1])
        assert verify(c, challenge, first).json()["code"] in {"OTP_INCORRECT", "OTP_EXPIRED"}
        assert verify(c, challenge, second).json() == {"next": "dashboard"}

    def test_five_sends_an_hour_per_member(self, holder, outbox) -> None:
        c = client()
        for _ in range(5):
            assert scan(c).status_code == 200
        limited = scan(c)
        assert limited.status_code == 429
        assert limited.json()["code"] == "OTP_SEND_LIMIT"

    def test_ten_recognised_cards_a_minute_per_address(self, holder, outbox, monkeypatch) -> None:
        from app.auth import otp

        monkeypatch.setattr(otp, "MEMBER_SENDS_PER_HOUR", 100)
        c = client()
        for _ in range(10):
            assert scan(c).status_code == 200
        assert scan(c).status_code == 429

    def test_a_failed_email_means_no_code_and_no_session(self, holder, monkeypatch) -> None:
        def refuse(**_: str) -> email.Sent:
            raise email.EmailFailed("SMTPServerDisconnected")

        monkeypatch.setattr(email, "send_email", refuse)
        c = client()
        response = scan(c)
        assert response.status_code == 503
        assert response.json() == {
            "code": "OTP_SEND_FAILED",
            "message": "We couldn't send the verification email. Try again in a moment.",
        }
        assert c.get("/api/v1/auth/me").status_code == 401

    def test_a_login_code_cannot_reset_a_password(self, holder, outbox) -> None:
        c = client()
        challenge = scan(c).json()["challengeId"]
        response = c.post(
            "/api/v1/auth/password/forgot/verify",
            json={"challengeId": challenge, "code": code_from(outbox[0])},
        )
        assert response.json()["code"] == "CHALLENGE_EXPIRED"
        assert reset.COOKIE_NAME not in response.headers.get("set-cookie", "")

    def test_the_old_direct_sign_in_is_gone(self) -> None:
        response = client().post(
            "/api/v1/auth/badge", content=frame(), headers={"Content-Type": "image/jpeg"}
        )
        assert response.status_code in {404, 405}


# -- forgot password -------------------------------------------------------------


def forgot(c: TestClient, identifier: str, address: str):
    return c.post("/api/v1/auth/password/forgot", json={"identifier": identifier, "email": address})


def email_of(member: dict[str, str]) -> str:
    return f"{member['username']}@example.org"


class TestForgotPassword:
    def test_matching_and_non_matching_answers_are_identical(self, outbox) -> None:
        member = make_member()
        real = forgot(client(), member["username"], email_of(member))
        wrong_email = forgot(client(), member["member_id"], "someone@else.org")
        nobody = forgot(client(), "no-such-member", "no@where.org")
        for response in (real, wrong_email, nobody):
            assert response.status_code == 200
            body = response.json()
            assert set(body) == {"message", "challengeId"}
            assert body["message"] == (
                "If these details match a registered member, a verification code has been "
                "sent to the registered email."
            )
            assert len(body["challengeId"]) == len(real.json()["challengeId"])
        assert sorted(real.headers) == sorted(nobody.headers)
        # Only the real match was emailed.
        assert [message["to"] for message in outbox] == [email_of(member)]

    def test_a_failed_send_does_not_change_the_answer(self, monkeypatch) -> None:
        def refuse(**_: str) -> email.Sent:
            raise email.EmailFailed("SMTPServerDisconnected")

        monkeypatch.setattr(email, "send_email", refuse)
        member = make_member()
        response = forgot(client(), member["username"], email_of(member))
        assert response.status_code == 200
        assert set(response.json()) == {"message", "challengeId"}

    def test_end_to_end_then_log_in_with_the_new_password(self, outbox) -> None:
        member = make_member(must_change=True)
        elsewhere = client()
        assert (
            elsewhere.post(
                "/api/v1/auth/login",
                json={"identifier": member["username"], "password": member["password"]},
            ).status_code
            == 200
        )

        c = client()
        challenge = forgot(c, member["username"], email_of(member)).json()["challengeId"]
        (message,) = outbox
        assert "You asked to reset your password" in message["text"]
        # The existing password is never sent or revealed.
        assert member["password"] not in message["text"] + message["html"]

        verified = c.post(
            "/api/v1/auth/password/forgot/verify",
            json={"challengeId": challenge, "code": code_from(message)},
        )
        assert verified.status_code == 200
        cookie = verified.headers["set-cookie"]
        assert cookie.startswith(f"{reset.COOKIE_NAME}=")
        assert "HttpOnly" in cookie and "SameSite=strict" in cookie
        assert "Max-Age=600" in cookie and "Path=/api/v1/auth/password/reset" in cookie

        done = c.post(
            "/api/v1/auth/password/reset",
            json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
        )
        assert done.json() == {"message": "Password updated. Log in with your new password."}
        assert f'{reset.COOKIE_NAME}=""' in done.headers["set-cookie"]

        # Every session the member had is over.
        assert elsewhere.get("/api/v1/auth/me").status_code == 401
        # The old password fails; the new one works, with no temporary-password step.
        old = client().post(
            "/api/v1/auth/login",
            json={"identifier": member["username"], "password": member["password"]},
        )
        assert old.status_code == 401
        new = client().post(
            "/api/v1/auth/login", json={"identifier": member["username"], "password": NEW_PASSWORD}
        )
        assert new.json() == {"next": "dashboard"}

    def test_the_reset_cookie_works_once(self, outbox) -> None:
        member = make_member()
        c = client()
        challenge = forgot(c, member["username"], email_of(member)).json()["challengeId"]
        c.post(
            "/api/v1/auth/password/forgot/verify",
            json={"challengeId": challenge, "code": code_from(outbox[0])},
        )
        body = {"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD}
        raw = c.cookies.get(reset.COOKIE_NAME)
        assert c.post("/api/v1/auth/password/reset", json=body).status_code == 200
        replay = client()
        replay.cookies.set(reset.COOKIE_NAME, raw, path="/api/v1/auth/password/reset")
        again = replay.post(
            "/api/v1/auth/password/reset",
            json={"newPassword": "Another-Leaf-9", "confirmPassword": "Another-Leaf-9"},
        )
        assert again.json()["code"] == "RESET_EXPIRED"

    def test_a_rule_breach_does_not_spend_the_cookie(self, outbox) -> None:
        member = make_member()
        c = client()
        challenge = forgot(c, member["username"], email_of(member)).json()["challengeId"]
        c.post(
            "/api/v1/auth/password/forgot/verify",
            json={"challengeId": challenge, "code": code_from(outbox[0])},
        )
        weak = c.post(
            "/api/v1/auth/password/reset",
            json={"newPassword": "weakpass", "confirmPassword": "weakpass"},
        )
        assert weak.status_code == 422 and weak.json()["code"] == "password_uppercase"
        strong = c.post(
            "/api/v1/auth/password/reset",
            json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
        )
        assert strong.status_code == 200

    def test_the_cookie_expires_after_ten_minutes(self, outbox) -> None:
        member = make_member()
        c = client()
        challenge = forgot(c, member["username"], email_of(member)).json()["challengeId"]
        c.post(
            "/api/v1/auth/password/forgot/verify",
            json={"challengeId": challenge, "code": code_from(outbox[0])},
        )
        with connect() as connection:
            connection.execute("UPDATE reset_tokens SET expires_at = ?", (time.time() - 1,))
            connection.commit()
        response = c.post(
            "/api/v1/auth/password/reset",
            json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
        )
        assert response.json()["code"] == "RESET_EXPIRED"

    def test_no_reset_without_the_cookie(self) -> None:
        response = client().post(
            "/api/v1/auth/password/reset",
            json={"newPassword": NEW_PASSWORD, "confirmPassword": NEW_PASSWORD},
        )
        assert response.status_code == 400 and response.json()["code"] == "RESET_EXPIRED"

    def test_a_decoy_challenge_only_ever_says_incorrect(self, outbox) -> None:
        c = client()
        challenge = forgot(c, "no-such-member", "no@where.org").json()["challengeId"]
        response = c.post(
            "/api/v1/auth/password/forgot/verify",
            json={"challengeId": challenge, "code": "123456"},
        )
        assert response.json()["code"] == "OTP_INCORRECT"
        assert reset.COOKIE_NAME not in response.headers.get("set-cookie", "")

    def test_wrong_codes_lock_a_reset_too(self, outbox) -> None:
        member = make_member()
        c = client()
        challenge = forgot(c, member["username"], email_of(member)).json()["challengeId"]
        bad = wrong(code_from(outbox[0]))
        for _ in range(4):
            c.post(
                "/api/v1/auth/password/forgot/verify", json={"challengeId": challenge, "code": bad}
            )
        locked = c.post(
            "/api/v1/auth/password/forgot/verify", json={"challengeId": challenge, "code": bad}
        )
        assert locked.json()["code"] == "OTP_LOCKED"

    def test_three_requests_an_hour_per_identifier_member_or_not(self, outbox) -> None:
        member = make_member()
        for identifier, address in ((member["username"], email_of(member)), ("ghost", "g@x.org")):
            for _ in range(3):
                assert forgot(client(), identifier, address).status_code == 200
            limited = forgot(client(), identifier, address)
            assert limited.status_code == 429

    def test_ten_requests_an_hour_per_address(self, outbox) -> None:
        for index in range(10):
            assert forgot(client(), f"ghost-{index}", "g@x.org").status_code == 200
        assert forgot(client(), "ghost-final", "g@x.org").status_code == 429

    def test_the_email_must_belong_to_that_member(self, outbox) -> None:
        mine, theirs = make_member(), make_member()
        forgot(client(), mine["username"], email_of(theirs))
        assert outbox == []


class TestNothingLeaks:
    def test_no_response_body_carries_a_code_or_token(self, holder, outbox) -> None:
        c = client()
        scanned = scan(c)
        code = code_from(outbox[0])
        verified = verify(c, scanned.json()["challengeId"], code)
        session_id = c.cookies.get(sessions.COOKIE_NAME)
        for response in (scanned, verified):
            assert code not in response.text
            assert session_id not in response.text
