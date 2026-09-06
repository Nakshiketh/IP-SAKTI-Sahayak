from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app

client = TestClient(create_app())


def test_health() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["app_name"] == "IP-SAKTI Sahayak"


def test_corpus_version_reports_no_corpus_yet() -> None:
    """No corpus is built before Phase 11. The API says so rather than inventing one."""
    response = client.get("/api/v1/corpus-version")
    assert response.status_code == 200
    body = response.json()
    assert body["document_count"] == 0
    assert body["as_of_date"] is None
    assert body["corpus_version"]
