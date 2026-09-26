"""Phase 6: the demo member card's endpoints, and that a card's QR still scans.

The endpoints exist only with ENABLE_DEMO_CARD on outside production, serve the
image `issue-card` wrote, and never generate or read a token themselves.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import demo_card
from app.auth import cards
from app.auth.members import DEMO_MEMBER, seed_demo_member
from app.auth.store import connect
from app.core import badge
from app.core.settings import get_settings
from app.main import app

pytestmark = pytest.mark.real_auth


@pytest.fixture
def card_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(demo_card, "CARDS_DIR", tmp_path)
    return tmp_path


@pytest.fixture
def issued(card_dir: Path) -> Path:
    """The demo member, their active card, and the image issue-card writes."""
    with connect() as connection:
        seed_demo_member(connection, "Temp-For-Card-1")
        cards.issue_card(connection, DEMO_MEMBER.member_id)
    return cards.render_badge_png(card_dir / f"{DEMO_MEMBER.member_id}-qr.png")


@pytest.fixture
def enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "enable_demo_card", True)
    monkeypatch.setattr(get_settings(), "environment", "development")


client = TestClient(app)


class TestAvailability:
    def test_absent_when_the_flag_is_off(self, issued, monkeypatch) -> None:
        monkeypatch.setattr(get_settings(), "enable_demo_card", False)
        assert client.get("/api/v1/demo/member-card").status_code == 404
        assert client.get("/api/v1/demo/member-card/qr.png").status_code == 404

    def test_absent_in_production_even_with_the_flag(self, issued, monkeypatch) -> None:
        monkeypatch.setattr(get_settings(), "enable_demo_card", True)
        monkeypatch.setattr(get_settings(), "environment", "production")
        assert client.get("/api/v1/demo/member-card").status_code == 404
        assert client.get("/api/v1/demo/member-card/qr.png").status_code == 404


class TestCard:
    def test_details_come_from_the_member_and_card_tables(self, issued, enabled) -> None:
        response = client.get("/api/v1/demo/member-card")
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Nakshiketh"
        assert body["role"] == "Student / Researcher"
        assert body["institution"] == "MGIT"
        assert body["memberId"] == "IPS-2026-0001"
        assert len(body["issuedOn"]) == 10 and body["issuedOn"][4] == "-"
        # Nothing about the card's token is in the answer.
        assert cards.BADGE_TOKEN not in response.text
        assert "token" not in response.text.lower()

    def test_the_image_is_the_file_issue_card_wrote(self, issued, enabled) -> None:
        response = client.get("/api/v1/demo/member-card/qr.png")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.headers["cache-control"] == "no-store"
        assert response.content == issued.read_bytes()

    def test_a_missing_image_says_what_to_run(self, issued, enabled) -> None:
        issued.unlink()
        response = client.get("/api/v1/demo/member-card")
        assert response.status_code == 404
        assert "issue-card" in response.json()["message"]
        assert client.get("/api/v1/demo/member-card/qr.png").status_code == 404

    def test_a_revoked_card_is_not_shown(self, issued, enabled) -> None:
        with connect() as connection:
            cards.revoke_card(connection, DEMO_MEMBER.member_id, "lost")
        response = client.get("/api/v1/demo/member-card")
        assert response.status_code == 404
        assert response.json()["code"] == "card_not_issued"

    def test_the_endpoint_never_writes_an_image(self, card_dir, enabled) -> None:
        with connect() as connection:
            seed_demo_member(connection, "Temp-For-Card-1")
            cards.issue_card(connection, DEMO_MEMBER.member_id)
        client.get("/api/v1/demo/member-card")
        client.get("/api/v1/demo/member-card/qr.png")
        assert list(card_dir.iterdir()) == []


class TestTheCardScans:
    """The QR as it sits on the card: on a white panel, a third of the card wide."""

    def card_image(self, qr_png: Path, width: int = 1011) -> np.ndarray:
        height = round(width * 54 / 85.6)
        card = np.full((height, width, 3), (54, 75, 29), dtype=np.uint8)  # leaf, BGR
        cv2.putText(
            card, "IP-SAKTI Sahayak", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3
        )
        cv2.putText(
            card, "Nakshiketh", (40, 260), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 255, 255), 3
        )
        cv2.putText(
            card, "IPS-2026-0001", (40, 380), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2
        )
        side = round(width * 0.34)
        qr = cv2.resize(cv2.imread(str(qr_png)), (side, side), interpolation=cv2.INTER_AREA)
        top, left = round(height * 0.18), width - side - 50
        card[top - 12 : top + side + 12, left - 12 : left + side + 12] = 255
        card[top : top + side, left : left + side] = qr
        return card

    def test_a_photo_of_the_card_signs_in(self, issued) -> None:
        card = self.card_image(issued)
        photo = cv2.resize(card, (640, round(640 * card.shape[0] / card.shape[1])))
        encoded = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
        assert badge.is_badge(encoded) is True

    def test_the_qr_is_at_least_22_mm_when_printed(self) -> None:
        # 34% of an 85.6 mm card is the image; the code itself is 29 of its 37 modules.
        image_mm = 85.6 * 0.34
        code_mm = image_mm * badge.SIZE / (badge.SIZE + 2 * cards.QUIET_ZONE)
        assert code_mm >= 22
