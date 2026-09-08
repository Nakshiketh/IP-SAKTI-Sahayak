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


def test_corpus_version_reports_the_index_that_is_actually_searched() -> None:
    """The count is what is being searched, and it says which store that is.

    No corpus is ingested before Phase 11, so the documents counted here are the
    demo fixture's. Reporting zero would be wrong now — questions really are
    answered from those documents — and reporting them without ``is_demo`` would
    be worse, because the footer would read like a built corpus.
    """
    response = client.get("/api/v1/corpus-version")
    assert response.status_code == 200
    body = response.json()
    assert body["document_count"] > 0
    assert body["is_demo"] is True
    assert body["corpus_version"] == "0.0.0-demo"
    # Nothing has been fetched, so there is no date on which it was current.
    assert body["as_of_date"] is None
