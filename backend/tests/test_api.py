"""The endpoints.

Two things are checked here that no unit test can: that the JSON on the wire
carries the field names the frontend already uses, and that the stream arrives
as events rather than as one blob at the end.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_rate_limiter
from app.main import app


@pytest.fixture
def client() -> TestClient:
    get_rate_limiter().reset()
    return TestClient(app)


def events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.strip().split("\n") if line]


def result_of(response) -> dict:
    return next(event for event in events(response) if event["event"] == "result")


def ask(client: TestClient, text: str, **body):
    return client.post("/api/v1/query", json={"text": text, **body})


# -- system ------------------------------------------------------------------


def test_health(client: TestClient) -> None:
    assert client.get("/api/v1/health").json()["status"] == "ok"


def test_corpus_version_reports_the_index_actually_being_searched(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/corpus-version").json()
    assert body["document_count"] > 0
    assert body["is_demo"] is True
    # Nothing has been fetched, so there is no date to report.
    assert body["as_of_date"] is None


# -- query -------------------------------------------------------------------


def test_the_stream_arrives_as_events_in_order(client: TestClient) -> None:
    stream = events(ask(client, "What licence do we need to manufacture in India?"))
    kinds = [event["event"] for event in stream]
    assert kinds[0] == "stage"
    assert kinds[-1] == "result"
    assert "retrieved" in kinds


def test_the_result_carries_the_field_names_the_interface_already_uses(
    client: TestClient,
) -> None:
    body = result_of(ask(client, "What licence do we need to manufacture in India?"))
    for field in (
        "queryId",
        "question",
        "jurisdiction",
        "evidence",
        "confidence",
        "answer",
        "relatedRecords",
        "followUps",
        "stages",
        "totalMs",
        "documentsSearched",
        "corpusVersion",
        "isDemo",
    ):
        assert field in body, field
    assert set(body["confidence"]) == {"level", "reasonKey", "reasonVars", "abstainReason"}
    assert set(body["evidence"]["passages"][0]) == {
        "citation_id",
        "document_id",
        "retrieval_score",
        "rerank_score",
        "within_effective_window",
    }


def test_an_abstention_returns_a_null_answer_not_an_error(client: TestClient) -> None:
    body = result_of(ask(client, "What are the patent rules in Brazil?", jurisdiction="INTL"))
    assert body["answer"] is None
    assert body["confidence"]["level"] == "abstain"
    assert body["confidence"]["abstainReason"] == "nothing_relevant"


def test_a_refused_question_says_which_rule_refused_it(client: TestClient) -> None:
    body = result_of(ask(client, "What dosage should a patient take?"))
    assert body["refusal"] == "clinical"
    assert body["confidence"]["abstainReason"] == "out_of_scope"


def test_a_cross_border_question_streams_two_results(client: TestClient) -> None:
    stream = events(ask(client, "Can we sell this in India and the UK, and what changes?"))
    results = [event for event in stream if event["event"] == "result"]
    assert len(results) == 2
    assert {result["jurisdiction"] for result in results} == {"IN", "INTL"}


def test_the_passage_behind_each_citation_is_sent_with_the_answer(
    client: TestClient,
) -> None:
    body = result_of(ask(client, "What licence do we need to manufacture in India?"))
    assert body["answer"] is not None
    for citation in body["answer"]["citations"]:
        assert citation["citation_id"] in body["passages"]


def test_an_empty_question_is_refused_before_anything_runs(client: TestClient) -> None:
    response = ask(client, "   ")
    assert response.status_code == 422
    assert response.json()["code"] == "empty_question"


def test_a_question_longer_than_the_cap_is_refused(client: TestClient) -> None:
    response = ask(client, "a" * 5000)
    assert response.status_code == 422
    assert response.json()["code"] == "question_too_long"


def test_a_body_larger_than_the_cap_never_reaches_the_endpoint(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/query",
        content=json.dumps({"text": "x" * 100_000}),
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "request_too_large"


def test_a_session_is_rate_limited_and_told_when_to_retry(client: TestClient) -> None:
    limiter = get_rate_limiter()
    limiter.reset()
    headers = {"x-session-id": "noisy"}
    last = None
    for _ in range(limiter.limit + 1):
        last = client.post("/api/v1/query", json={"text": "What licence?"}, headers=headers)
    assert last is not None
    assert last.status_code == 429
    assert last.json()["code"] == "rate_limited"
    assert int(last.headers["retry-after"]) >= 1


def test_one_session_being_limited_does_not_limit_another(client: TestClient) -> None:
    limiter = get_rate_limiter()
    limiter.reset()
    for _ in range(limiter.limit + 1):
        client.post("/api/v1/query", json={"text": "q"}, headers={"x-session-id": "a"})
    other = client.post("/api/v1/query", json={"text": "q"}, headers={"x-session-id": "b"})
    assert other.status_code == 200


# -- classification ----------------------------------------------------------


def test_classification_asks_the_first_question_when_given_nothing(
    client: TestClient,
) -> None:
    body = client.post("/api/v1/classify", json={"answers": {}}).json()
    assert body["next"] is not None
    assert body["classes"] == []
    assert body["questionsRemainingAtMost"] <= 8


def test_classification_reaches_a_class_and_never_returns_undetermined(
    client: TestClient,
) -> None:
    body = client.post(
        "/api/v1/classify",
        json={"answers": {"external_use": "yes"}},
    ).json()
    assert body["outcomeId"] is not None
    assert body["classes"]
    assert "undetermined" not in body["classes"]
    assert body["questionsRemainingAtMost"] == 0


def test_an_answer_the_graph_does_not_know_is_rejected(client: TestClient) -> None:
    response = client.post("/api/v1/classify", json={"answers": {"external_use": "maybe"}})
    assert response.status_code == 422
    assert response.json()["code"] == "unknown_answer"


# -- access and benefit sharing ----------------------------------------------


def test_nothing_accessed_means_nothing_engaged(client: TestClient) -> None:
    body = client.post("/api/v1/abs-check", json={"answers": {"access": "no"}}).json()
    assert body["engaged"] is False
    assert body["panels"] == []


def test_abs_asks_for_what_it_still_needs(client: TestClient) -> None:
    body = client.post("/api/v1/abs-check", json={"answers": {"access": "yes"}}).json()
    assert body["nextQuestion"] is not None
    assert body["panels"] == []


def test_a_complete_abs_walk_names_panels_and_the_sources_they_will_rest_on(
    client: TestClient,
) -> None:
    body = client.post(
        "/api/v1/abs-check",
        json={
            "answers": {
                "access": "yes",
                "who": "indian_company",
                "purpose": "commercial",
                "ip": "yes",
                "knowledge": "codified",
            }
        },
    ).json()
    assert body["engaged"] is True
    assert body["panels"]
    assert body["pendingSources"]
    assert body["nextQuestion"] is None


# -- sources -----------------------------------------------------------------


def test_the_source_set_is_listed_with_what_has_actually_been_fetched(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/sources").json()
    assert body["documents"]
    assert body["groupOrder"]
    # Nothing has been ingested yet, and the count says so rather than hiding it.
    assert body["fetchedCount"] == 0


def test_sources_can_be_filtered(client: TestClient) -> None:
    everything = client.get("/api/v1/sources").json()["documents"]
    india = client.get("/api/v1/sources", params={"jurisdiction": "IN"}).json()["documents"]
    assert 0 < len(india) < len(everything)
    assert all(document["jurisdiction"] == "IN" for document in india)


def test_a_document_reports_how_many_passages_are_indexed_for_it(
    client: TestClient,
) -> None:
    first = client.get("/api/v1/sources").json()["documents"][0]
    body = client.get("/api/v1/sources/" + first["document_id"]).json()
    assert body["document"]["document_id"] == first["document_id"]
    # Planned but not fetched: zero passages, reported rather than omitted.
    assert body["chunkCount"] == 0


def test_an_unknown_document_is_a_404_naming_it(client: TestClient) -> None:
    response = client.get("/api/v1/sources/not-a-document")
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_document"


# -- feedback and escalation -------------------------------------------------


def test_feedback_says_the_note_was_not_stored(client: TestClient) -> None:
    body = client.post(
        "/api/v1/feedback",
        json={"verdict": "not_helpful", "note": "private details about our product"},
    ).json()
    assert body["recorded"] is True
    assert "not stored" in body["note"]


def test_escalation_says_nothing_was_sent_to_anyone(client: TestClient) -> None:
    body = client.post("/api/v1/escalate", json={"jurisdiction": "IN"}).json()
    assert body["recorded"] is True
    assert "no expert network" in body["note"]
