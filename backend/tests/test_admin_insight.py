"""The dashboard, and the four things it must not become.

`test_insight.py` already pins what the numbers themselves may contain. What is
tested here is the route: who may read it, what it refuses, and — the one that
matters most — that no path through it reaches anything anybody typed.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.settings import get_settings
from app.main import app
from app.services.audit import AuditLog, AuditRow, hash_question
from app.services.insight import MIN_BUCKET
from tests.members import client_for, make_member

SECRET = "our ashwagandha and shilajit extract uses a modified supercritical process"

# Who may read the dashboard is the subject here, so these run against real
# sessions rather than the suite's signed-in override.
pytestmark = pytest.mark.real_auth


@pytest.fixture
def admin() -> dict[str, str]:
    return make_member()


@pytest.fixture
def client(tmp_path, monkeypatch, admin):
    monkeypatch.setenv("SAHAYAK_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SAHAYAK_FEATURE_ADMIN_INSIGHTS", "true")
    monkeypatch.setenv("SAHAYAK_ADMIN_USERNAMES", admin["username"])
    get_settings.cache_clear()
    yield client_for(app)
    get_settings.cache_clear()


@pytest.fixture
def sign_in(client: TestClient, admin):
    """Sign the administrator in. The session is a cookie the client keeps."""

    def go(_client: TestClient) -> dict[str, str]:
        body = _client.post(
            "/api/v1/auth/login",
            json={"identifier": admin["username"], "password": admin["password"]},
        )
        assert body.status_code == 200, body.text
        return {}

    return go


def write_queries(tmp_path, count: int, **overrides) -> None:
    log = AuditLog(tmp_path / "audit.sqlite3", enabled=True)
    for index in range(count):
        row = {
            "event": "query",
            "session_id": f"s{index}",
            "query_id": f"q{index}",
            "question_hash": hash_question(SECRET),
            "jurisdiction": "IN",
            "language_in": "en",
            "confidence": "high",
            "abstained": False,
            "latency_ms": 20 + index,
        }
        row.update(overrides)
        log.record(AuditRow(**row))


# -- who may read it ----------------------------------------------------------


def test_signing_in_is_not_enough(client, sign_in, monkeypatch) -> None:
    monkeypatch.setenv("SAHAYAK_ADMIN_USERNAMES", "someone-else")
    get_settings.cache_clear()
    response = client.get("/api/v1/admin/insight", headers=sign_in(client))
    assert response.status_code == 403


def test_an_anonymous_reader_is_refused(client) -> None:
    assert client.get("/api/v1/admin/insight").status_code == 401


def test_the_route_does_not_exist_when_the_flag_is_off(client, sign_in, monkeypatch) -> None:
    headers = sign_in(client)
    monkeypatch.setenv("SAHAYAK_FEATURE_ADMIN_INSIGHTS", "false")
    get_settings.cache_clear()
    assert client.get("/api/v1/admin/insight", headers=headers).status_code == 404


def test_nobody_is_an_administrator_by_default(client, sign_in, monkeypatch) -> None:
    # The empty default has to mean nobody, not everybody. This is the one
    # mistake in the file that would hand every signed-in account the dashboard.
    monkeypatch.setenv("SAHAYAK_ADMIN_USERNAMES", "")
    get_settings.cache_clear()
    assert client.get("/api/v1/admin/insight", headers=sign_in(client)).status_code == 403


def test_an_administrator_reads_it(client, sign_in, tmp_path) -> None:
    write_queries(tmp_path, MIN_BUCKET + 2)
    response = client.get("/api/v1/admin/insight", headers=sign_in(client))
    assert response.status_code == 200
    assert response.json()["total_queries"] == MIN_BUCKET + 2


# -- what it may contain ------------------------------------------------------


def test_no_question_reaches_the_endpoint(client, sign_in, tmp_path) -> None:
    write_queries(tmp_path, MIN_BUCKET + 2)
    body = client.get("/api/v1/admin/insight", headers=sign_in(client)).text
    for word in ("ashwagandha", "shilajit", "supercritical", SECRET):
        assert word not in body.lower()


def test_a_small_bucket_is_withheld_and_the_withholding_is_reported(
    client, sign_in, tmp_path
) -> None:
    write_queries(tmp_path, MIN_BUCKET, jurisdiction="IN")
    write_queries(tmp_path, MIN_BUCKET - 1, jurisdiction="INTL")

    body = client.get("/api/v1/admin/insight", headers=sign_in(client)).json()
    assert [b["name"] for b in body["by_jurisdiction"]] == ["IN"]
    assert body["suppressed_buckets"] >= 1
    assert body["minimum_bucket"] == MIN_BUCKET


def test_every_figure_says_whose_data_it_is(client, sign_in, tmp_path) -> None:
    write_queries(tmp_path, MIN_BUCKET)
    body = client.get("/api/v1/admin/insight", headers=sign_in(client)).json()
    assert body["provenance"]


def test_an_empty_deployment_reports_nothing_rather_than_zero_rates(client, sign_in) -> None:
    body = client.get("/api/v1/admin/insight", headers=sign_in(client)).json()
    assert body["total_queries"] == 0
    # Not 0.0. Nobody has asked anything, which is not the same as a 0%
    # abstention rate, and a dashboard that showed 0% would be inventing one.
    assert body["abstention_rate"] is None


def test_the_dashboard_cannot_place_a_call(client, sign_in, tmp_path) -> None:
    # The telephony seam and the admin surface must not meet: an insight page
    # that could dial would be a way to reach people from a usage report.
    write_queries(tmp_path, MIN_BUCKET)
    body = client.get("/api/v1/admin/insight", headers=sign_in(client)).json()
    assert "telephony" not in str(body).lower()
    assert "phone" not in str(body).lower()
