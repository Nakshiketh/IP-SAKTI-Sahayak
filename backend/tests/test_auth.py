"""The front door.

What is worth guarding here is mostly what the endpoints refuse: a wrong
password and a missing account have to be indistinguishable, a password must
never be recoverable from what is stored, and a token this instance did not
issue must not open anything.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import auth
from app.api.deps import get_rate_limiter
from app.core import badge
from app.main import app

#: The Digital QR Badge as it was issued. Kept here, not in the web app's public
#: folder, so the credential is not downloadable from the site.
ISSUED_BADGE = Path(__file__).parent / "fixtures" / "digital-qr-badge.jpg"


@pytest.fixture
def client() -> TestClient:
    get_rate_limiter().reset()
    return TestClient(app)


@pytest.fixture(autouse=True)
def isolated_accounts(tmp_path, monkeypatch):
    """One accounts database per test, and never the real one."""
    monkeypatch.setattr(auth, "_db_path", lambda: tmp_path / "accounts.sqlite3")
    # 200k PBKDF2 rounds is right for a deployment and wrong for a test suite
    # that signs in on nearly every case.
    monkeypatch.setattr(auth, "PBKDF2_ROUNDS", 1_000)
    yield


def signin(client: TestClient, username: str = "demo", password: str = "demo1234"):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


class TestSignIn:
    def test_the_seeded_account_can_sign_in(self, client: TestClient) -> None:
        response = signin(client)
        assert response.status_code == 200
        body = response.json()
        assert body["user"]["username"] == "demo"
        assert body["token"]

    def test_a_wrong_password_and_an_unknown_user_are_indistinguishable(
        self, client: TestClient
    ) -> None:
        wrong = signin(client, password="not-the-password")
        missing = signin(client, username="nobody-at-all", password="anything")

        assert wrong.status_code == missing.status_code == 401
        # Identical to the byte. Two messages here would enumerate usernames.
        assert wrong.json() == missing.json()

    def test_the_username_is_not_case_sensitive(self, client: TestClient) -> None:
        assert signin(client, username="DEMO").status_code == 200

    def test_a_password_is_never_stored_in_a_recoverable_form(self, client: TestClient) -> None:
        signin(client)
        connection = sqlite3.connect(auth._db_path())
        row = connection.execute("SELECT * FROM accounts WHERE username = 'demo'").fetchone()
        connection.close()

        stored = b"".join(value for value in row if isinstance(value, bytes))
        assert b"demo1234" not in stored
        # A salt means two accounts with one password do not share a hash.
        assert len(row[3]) == 16


class TestRegister:
    def test_registering_signs_the_new_account_in(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Ada Lovelace",
                "email": "ada@example.com",
                "username": "ada",
                "password": "analytical-engine",
            },
        )
        assert response.status_code == 201
        assert response.json()["user"]["name"] == "Ada Lovelace"

    def test_a_taken_username_is_refused_rather_than_overwriting(self, client: TestClient) -> None:
        body = {
            "name": "Someone Else",
            "email": "else@example.com",
            "username": "demo",
            "password": "a-good-password",
        }
        signin(client)  # seeds the demo account
        assert client.post("/api/v1/auth/register", json=body).status_code == 409
        # The original password still works: nothing was overwritten.
        assert signin(client).status_code == 200

    @pytest.mark.parametrize("email", ["not-an-email", "missing@tld", "@example.com"])
    def test_an_unusable_email_is_refused(self, client: TestClient, email: str) -> None:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Test",
                "email": email,
                "username": "tester",
                "password": "a-good-password",
            },
        )
        assert response.status_code == 422

    def test_a_short_password_is_refused_by_the_schema(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Test",
                "email": "test@example.com",
                "username": "tester",
                "password": "short",
            },
        )
        assert response.status_code == 422


def render(rows, module: int = 10, quiet: int = 4) -> np.ndarray:
    """A crisp black-on-white picture of a module grid, as a camera would see a print."""
    side = (len(rows) + 2 * quiet) * module
    pixels = np.full((side, side), 255, dtype=np.uint8)
    for r, row in enumerate(rows):
        for c, cell in enumerate(row):
            if cell in ("#", 1, True):
                top, left = (r + quiet) * module, (c + quiet) * module
                pixels[top : top + module, left : left + module] = 0
    return pixels


def jpeg(pixels: np.ndarray) -> bytes:
    """Encoded the way the scanner sends a frame: small enough for the 32 KB body cap."""
    if pixels.ndim == 3:
        pixels = cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY)
    return cv2.imencode(".jpg", pixels, [cv2.IMWRITE_JPEG_QUALITY, 60])[1].tobytes()


def show(client: TestClient, image: bytes, content_type: str = "image/jpeg"):
    return client.post("/api/v1/auth/badge", content=image, headers={"Content-Type": content_type})


class TestAuthorisedQr:
    def test_the_authorised_code_signs_in(self, client: TestClient) -> None:
        response = show(client, jpeg(render(badge.BADGE)))
        assert response.status_code == 200
        assert response.json()["user"]["username"] == "demo"

    def test_the_issued_badge_photo_signs_in(self, client: TestClient) -> None:
        pixels = cv2.imread(str(ISSUED_BADGE))
        frame = cv2.resize(pixels, (480, 480), interpolation=cv2.INTER_AREA)
        assert show(client, jpeg(frame)).status_code == 200

    def test_it_is_recognised_at_any_quarter_turn(self, client: TestClient) -> None:
        for turn in (1, 2, 3):
            rotated = np.ascontiguousarray(np.rot90(render(badge.BADGE), turn))
            assert show(client, jpeg(rotated)).status_code == 200

    @pytest.mark.parametrize(
        "text", ["IP-SAKTI-SAHAYAK", "SAHAYAK-001", "https://kommodo.ai/i/ph6HxEJVh4glpecSr2Vr"]
    )
    def test_a_generated_code_is_denied_whatever_it_says(
        self, client: TestClient, text: str
    ) -> None:
        other = cv2.QRCodeEncoder.create().encode(text)
        other = cv2.resize(other, None, fx=10, fy=10, interpolation=cv2.INTER_NEAREST)
        response = show(client, jpeg(other))
        assert response.status_code == 403
        assert response.json()["code"] == "invalid_qr"
        assert "token" not in response.json()

    def test_a_near_copy_is_denied(self, client: TestClient) -> None:
        """The badge with an eighth of its distinctive modules changed is not the badge."""
        grid = np.array([[cell == "#" for cell in row] for row in badge.BADGE])
        rng = np.random.default_rng(7)
        cells = np.argwhere(badge._DISTINCTIVE)
        for r, c in cells[rng.choice(len(cells), size=len(cells) // 8, replace=False)]:
            grid[r, c] = not grid[r, c]
        assert show(client, jpeg(render(grid.tolist()))).status_code == 403

    def test_a_frame_with_no_code_is_not_a_sign_in(self, client: TestClient) -> None:
        blank = np.full((480, 480), 255, dtype=np.uint8)
        response = show(client, jpeg(blank))
        assert response.status_code == 422
        assert response.json()["code"] == "no_code"

    def test_only_an_image_is_accepted(self, client: TestClient) -> None:
        assert show(client, b"{}", "application/json").status_code == 415
        assert show(client, b"not an image").status_code == 422

    def test_there_is_no_typed_code_route(self, client: TestClient) -> None:
        """A string can come from any QR generator, so no route accepts one."""
        response = client.post("/api/v1/auth/barcode", json={"code": "SAHAYAK-001"})
        assert response.status_code in (404, 405)
        assert "token" not in response.json()


class TestTokens:
    def test_a_token_names_the_account_it_was_issued_for(self, client: TestClient) -> None:
        token = signin(client).json()["token"]
        response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["username"] == "demo"

    def test_a_tampered_token_is_refused(self, client: TestClient) -> None:
        token = signin(client).json()["token"]
        payload, signature = token.split(".", 1)
        # Same signature, different claims: this is the forgery the HMAC exists
        # to catch, and it must not turn into a session for anyone.
        forged = f"{payload[:-4]}AAAA.{signature}"
        response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"})
        assert response.status_code == 401

    def test_an_expired_token_is_refused(self, client: TestClient, monkeypatch) -> None:
        monkeypatch.setattr(auth, "TOKEN_TTL_SECONDS", -1)
        token = auth.issue_token("demo")
        response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "header",
        [None, "", "Bearer", "Bearer   ", "Basic abc", "not-a-scheme token"],
    )
    def test_a_malformed_authorization_header_is_refused(
        self, client: TestClient, header: str | None
    ) -> None:
        headers = {} if header is None else {"Authorization": header}
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
