"""QR sign-in: the member card, shown to the camera.

The matcher is what is guarded here: the card's own pattern signs in at any
quarter-turn and from the issued photograph, while a generated code, a near
copy, a blank frame and anything that is not an image do not. Password login,
sessions and the rest are in `test_member_auth_api.py`.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.auth import cards
from app.auth.store import connect
from app.core import badge
from app.main import app
from tests.conftest import code_from
from tests.members import CSRF, make_member

#: The Digital QR Badge as it was issued. Kept here, not in the web app's public
#: folder, so the credential is not downloadable from the site.
ISSUED_BADGE = Path(__file__).parent / "fixtures" / "digital-qr-badge.jpg"

pytestmark = pytest.mark.real_auth


@pytest.fixture
def card_holder() -> dict[str, str]:
    """A member holding the card, as `issue-card` leaves them."""
    member = make_member()
    with connect() as connection:
        cards.issue_card(connection, member["member_id"])
    return member


@pytest.fixture
def client(card_holder, outbox) -> TestClient:
    return TestClient(app, headers=CSRF)


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
    return client.post(
        "/api/v1/auth/qr/verify", content=image, headers={"Content-Type": content_type}
    )


class TestAuthorisedQr:
    def test_the_card_starts_a_challenge_and_emails_a_code(
        self, client: TestClient, card_holder, outbox
    ) -> None:
        response = show(client, jpeg(render(badge.BADGE)))
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"challengeId", "member", "maskedEmail", "resendAvailableAt"}
        assert body["member"]["memberId"] == card_holder["member_id"]
        assert set(body["member"]) == {"name", "role", "institution", "memberId"}
        assert "@example.org" in body["maskedEmail"] and "*" in body["maskedEmail"]
        (message,) = outbox
        assert message["to"] == f"{card_holder['username']}@example.org"
        # The card alone opens nothing.
        assert "set-cookie" not in response.headers
        assert client.get("/api/v1/auth/me").status_code == 401

    def test_the_code_completes_the_sign_in(self, client: TestClient, outbox) -> None:
        challenge = show(client, jpeg(render(badge.BADGE))).json()["challengeId"]
        response = client.post(
            "/api/v1/auth/otp/verify",
            json={"challengeId": challenge, "code": code_from(outbox[0])},
        )
        assert response.status_code == 200
        assert response.json() == {"next": "dashboard"}
        assert client.get("/api/v1/auth/me").status_code == 200

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
        assert response.json()["code"] == "QR_INVALID"
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

    def test_a_revoked_card_is_refused_by_name(self, client: TestClient, card_holder) -> None:
        with connect() as connection:
            cards.revoke_card(connection, card_holder["member_id"], "lost")
        response = show(client, jpeg(render(badge.BADGE)))
        assert response.status_code == 403
        assert response.json()["code"] == "QR_REVOKED"

    def test_a_card_whose_member_is_inactive_is_refused(
        self, client: TestClient, card_holder
    ) -> None:
        with connect() as connection:
            connection.execute(
                "UPDATE members SET is_active = 0 WHERE member_id = ?", (card_holder["member_id"],)
            )
            connection.commit()
        response = show(client, jpeg(render(badge.BADGE)))
        assert response.status_code == 403
        assert response.json()["code"] == "MEMBER_INACTIVE"

    def test_a_card_on_a_temporary_password_opens_a_restricted_session(self, outbox) -> None:
        member = make_member(must_change=True)
        with connect() as connection:
            cards.issue_card(connection, member["member_id"])
        client = TestClient(app, headers=CSRF)
        challenge = show(client, jpeg(render(badge.BADGE))).json()["challengeId"]
        response = client.post(
            "/api/v1/auth/otp/verify",
            json={"challengeId": challenge, "code": code_from(outbox[0])},
        )
        assert response.json() == {"next": "change-password"}
        assert client.get("/api/v1/auth/me").json()["restricted"] is True

    def test_sign_in_without_the_csrf_header_is_refused(self, card_holder) -> None:
        response = TestClient(app).post(
            "/api/v1/auth/qr/verify",
            content=jpeg(render(badge.BADGE)),
            headers={"Content-Type": "image/jpeg"},
        )
        assert response.status_code == 403
