"""Consent, the access log, the audit viewer, and the response headers.

The point of these tests is that the privacy page's claims are checkable. Each
one that says "this is not stored" or "this needs your say-so first" has a test
here that fails if it stops being true.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_rate_limiter
from app.main import DOCS_PATHS, SECURITY_HEADERS, app
from app.services.audit import AuditLog, AuditRow, hash_question
from app.services.consent import ConsentLedger


@pytest.fixture
def client() -> TestClient:
    get_rate_limiter().reset()
    return TestClient(app)


@pytest.fixture
def ledger(tmp_path) -> ConsentLedger:
    """A real log on disk. The suite's own audit is disabled by conftest."""
    return ConsentLedger(AuditLog(tmp_path / "audit.sqlite3", enabled=True))


# -- the consent ledger ------------------------------------------------------


def test_a_grant_and_a_withdrawal_both_survive(ledger: ConsentLedger) -> None:
    """A withdrawal is a second row, never the erasure of the first.

    The reader's access log has to be able to show that consent was held between
    two dates. A store that deleted the grant could not.
    """
    ledger.record(session_id="s1", source_id="d1", source_name="A Register", granted=True)
    ledger.record(session_id="s1", source_id="d1", source_name="A Register", granted=False)

    events = ledger.events_for("s1")
    assert [event.granted for event in events] == [False, True]
    assert ledger.granted_source_ids("s1") == set()


def test_the_latest_row_decides_and_regranting_works(ledger: ConsentLedger) -> None:
    ledger.record(session_id="s1", source_id="d1", source_name="A", granted=True)
    ledger.record(session_id="s1", source_id="d1", source_name="A", granted=False)
    ledger.record(session_id="s1", source_id="d1", source_name="A", granted=True)
    assert ledger.granted_source_ids("s1") == {"d1"}


def test_one_session_never_sees_another_sessions_consent(ledger: ConsentLedger) -> None:
    ledger.record(session_id="s1", source_id="d1", source_name="A", granted=True)
    ledger.record(session_id="s2", source_id="d2", source_name="B", granted=True)
    assert ledger.granted_source_ids("s1") == {"d1"}
    assert [event.source_id for event in ledger.events_for("s2")] == ["d2"]


def test_consent_is_per_source_not_global(ledger: ConsentLedger) -> None:
    """Agreeing to one source must not agree to the next one."""
    ledger.record(session_id="s1", source_id="d1", source_name="A", granted=True)
    assert ledger.granted_source_ids("s1") == {"d1"}
    assert "d2" not in ledger.granted_source_ids("s1")


def test_a_consent_row_holds_no_question_and_no_credential(ledger: ConsentLedger) -> None:
    ledger.record(session_id="s1", source_id="d1", source_name="A", granted=True)
    row = ledger._audit.read_recent(limit=1)[0]
    assert row["question_hash"] is None
    assert row["passage_ids"] == "[]"
    assert set(json.loads(row["detail"])) == {"source_id", "source_name"}


# -- the endpoints -----------------------------------------------------------


def test_the_access_log_starts_empty_and_names_no_credentialed_source(
    client: TestClient,
) -> None:
    """Nothing in the current source set needs a reader's own credentials.

    This is the fact the privacy page renders. When a credentialed source is
    added to the manifest this assertion is what will fail, which is the point:
    the page must not go on saying none exists.
    """
    body = client.get("/api/v1/access-log", headers={"X-Session-Id": "fresh"}).json()
    assert body["events"] == []
    assert body["granted"] == []
    assert body["credentialedSources"] == []


def test_consent_to_a_source_that_needs_none_is_refused(client: TestClient) -> None:
    """A row naming a source nobody could have agreed to is worse than an error."""
    response = client.post(
        "/api/v1/consent",
        json={"source_id": "in-patents-act-1970", "granted": True},
        headers={"X-Session-Id": "s1"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_source"


def test_consent_to_an_invented_source_is_refused(client: TestClient) -> None:
    response = client.post(
        "/api/v1/consent",
        json={"source_id": "no-such-source", "granted": True},
        headers={"X-Session-Id": "s1"},
    )
    assert response.status_code == 404


# -- the audit viewer --------------------------------------------------------


def test_the_audit_viewer_reports_the_columns_the_table_actually_has(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/audit").json()
    columns = body["columns"]
    assert "session_id" in columns
    assert "passage_ids" in columns
    assert "question_hash" in columns
    # The claim the privacy page makes: the reader's words are not a column.
    assert "question" not in columns
    assert "question_text" not in columns
    assert "answer" not in columns
    assert "ip_address" not in columns


def test_the_audit_viewer_is_not_served_outside_development(
    client: TestClient, monkeypatch
) -> None:
    from app.core import settings as settings_module

    monkeypatch.setattr(settings_module.get_settings(), "environment", "production", raising=False)
    response = client.get("/api/v1/audit")
    assert response.status_code == 404
    assert response.json()["code"] == "not_available"


def test_the_question_hash_does_not_carry_the_question(tmp_path) -> None:
    """The fingerprint recognises a repeat. It does not hold the words.

    Asserted rather than assumed, because "we only store a hash" is exactly the
    kind of claim that quietly becomes false when somebody needs a debug field.
    """
    question = "What licence do we need to manufacture in India?"
    digest = hash_question(question)
    assert "licence" not in digest
    assert "India" not in digest
    assert hash_question(question) == hash_question(
        " WHAT LICENCE DO WE NEED TO MANUFACTURE IN INDIA? "
    )

    log = AuditLog(tmp_path / "audit.sqlite3", enabled=True)
    log.record(AuditRow(event="query", session_id="s1", question_hash=digest))
    stored = json.dumps(log.read_recent(limit=1)[0]).lower()
    # The content words only. Matching on every token would trip over "to"
    # appearing inside a column name, which says nothing about the question.
    for word in ("licence", "manufacture", "india", "need"):
        assert word not in stored


# -- response headers --------------------------------------------------------


@pytest.mark.parametrize("header", sorted(SECURITY_HEADERS))
def test_every_response_carries_the_security_headers(client: TestClient, header: str) -> None:
    assert client.get("/api/v1/health").headers[header] == SECURITY_HEADERS[header]


def test_the_headers_are_on_error_responses_too(client: TestClient) -> None:
    """The responses most worth covering are the ones no route wrote."""
    response = client.get("/api/v1/no-such-endpoint")
    assert response.status_code == 404
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert (
        response.headers["Content-Security-Policy"] == (SECURITY_HEADERS["Content-Security-Policy"])
    )


def test_the_documentation_page_gets_its_own_policy(client: TestClient) -> None:
    """It loads its viewer from a CDN, so `default-src 'none'` would break it."""
    response = client.get(DOCS_PATHS[0])
    assert response.status_code == 200
    policy = response.headers["Content-Security-Policy"]
    assert "cdn.jsdelivr.net" in policy
    assert "frame-ancestors 'none'" in policy
