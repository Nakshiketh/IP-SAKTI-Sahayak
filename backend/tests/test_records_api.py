"""The records endpoints, and the boundary they sit on.

`/api/v1/records/*` is a different router from `/api/v1/query` on purpose: there
is no way to ask this one for an answer and no way to ask that one for a record.
The tests at the bottom are the ones that matter — an abstention with records
beside it still reads as an abstention, and no record ever reaches the generator.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.core.settings import Settings
from app.records.ingest import ingest_aggregates, ingest_source
from app.records.manifest import RecordsManifest
from app.records.store import RecordsStore
from app.services.records_service import RecordsService

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES = REPO_ROOT / "corpus" / "samples" / "records-manifest.json"
WHEN = datetime(2026, 1, 1, tzinfo=UTC)


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    """The app, serving a records store built from the sample registry."""
    store = RecordsStore(tmp_path / "records.sqlite3")
    manifest = RecordsManifest.load(SAMPLES)
    for source in manifest.sources:
        if source.record_type == "aggregate_statistic":
            ingest_aggregates(source, store, data_dir=SAMPLES.parent)
        else:
            ingest_source(source, store, data_dir=SAMPLES.parent, taken_at=WHEN)

    service = RecordsService(store, SAMPLES)
    monkeypatch.setattr(deps, "get_records_service", lambda: service)
    monkeypatch.setattr("app.api.records.get_records_service", lambda: service)
    deps.get_rate_limiter().reset()

    from app.main import app

    return TestClient(app)


@pytest.fixture
def empty_client(tmp_path, monkeypatch) -> TestClient:
    service = RecordsService(RecordsStore(tmp_path / "nothing.sqlite3"), SAMPLES)
    monkeypatch.setattr(deps, "get_records_service", lambda: service)
    monkeypatch.setattr("app.api.records.get_records_service", lambda: service)
    deps.get_rate_limiter().reset()

    from app.main import app

    return TestClient(app)


# -- search ------------------------------------------------------------------


def test_search_returns_records_with_what_they_are(client: TestClient) -> None:
    body = client.get("/api/v1/records/search", params={"q": "polyherbal"}).json()
    assert body["total"] == 1
    assert body["ingested"] is True
    assert body["records"][0]["citable_in_answers"] is False
    assert "never a statement of law" in body["note"]


def test_nothing_matched_is_not_nothing_ingested(client: TestClient) -> None:
    """The two kinds of empty are different answers, and the payload says which."""
    body = client.get("/api/v1/records/search", params={"q": "nothing-matches-this"}).json()
    assert body["total"] == 0
    assert body["recordCount"] > 0
    assert body["ingested"] is True


def test_match_any_finds_what_matching_every_word_misses(client: TestClient) -> None:
    """A product described by several words: no filing names all of them."""
    words = "polyherbal nothing-matches-this"
    every = client.get("/api/v1/records/search", params={"q": words}).json()
    any_ = client.get("/api/v1/records/search", params={"q": words, "match_any": True}).json()
    assert every["total"] == 0
    assert any_["total"] == 1
    assert all(record["citable_in_answers"] is False for record in any_["records"])


def test_an_empty_store_says_nothing_has_been_ingested(empty_client: TestClient) -> None:
    body = empty_client.get("/api/v1/records/search", params={"q": "anything"}).json()
    assert body["total"] == 0
    assert body["recordCount"] == 0
    assert body["ingested"] is False


def test_search_can_be_filtered(client: TestClient) -> None:
    granted = client.get("/api/v1/records/search", params={"status": "Granted"}).json()
    assert granted["total"] > 0
    assert all(record["status"] == "Granted" for record in granted["records"])


def test_a_record_reads_back_with_its_attribution(client: TestClient) -> None:
    found = client.get("/api/v1/records/search", params={"q": "polyherbal"}).json()["records"][0]
    body = client.get("/api/v1/records/" + found["record_id"]).json()
    assert body["record"]["record_id"] == found["record_id"]
    assert body["attributionText"]
    assert "Not a statement of law" in body["note"]


def test_an_unknown_record_is_a_404_naming_it(client: TestClient) -> None:
    response = client.get("/api/v1/records/not-a-record")
    assert response.status_code == 404
    assert response.json()["code"] == "unknown_record"


# -- landscape ---------------------------------------------------------------


def test_landscape_is_its_own_endpoint_and_says_what_it_is(client: TestClient) -> None:
    body = client.get("/api/v1/records/landscape").json()
    assert body["rows"]
    assert all(row["citableInAnswers"] is False for row in body["rows"])
    assert "never a particular product" in body["note"]


def test_landscape_can_be_filtered_by_dimension(client: TestClient) -> None:
    body = client.get("/api/v1/records/landscape", params={"field": "processes"}).json()
    assert body["rows"]
    assert {row["dimension"] for row in body["rows"]} == {"processes"}


def test_an_aggregate_carries_no_way_to_name_a_product(client: TestClient) -> None:
    row = client.get("/api/v1/records/landscape").json()["rows"][0]
    assert set(row) == {
        "sourceId",
        "dimension",
        "period",
        "measure",
        "value",
        "citableInAnswers",
    }


# -- sources and portals -----------------------------------------------------


def test_the_sources_list_carries_licence_and_attribution(client: TestClient) -> None:
    body = client.get("/api/v1/records/sources").json()
    rows = {row["sourceId"]: row for row in body["sources"]}
    ingested = rows["sample-registry-applications"]
    assert ingested["ingested"] is True
    assert ingested["licence"]
    assert ingested["attributionText"]
    assert all(row["citableInAnswers"] is False for row in body["sources"])


def test_a_portal_is_listed_as_somewhere_this_product_did_not_look(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/records/sources", params={"q": "joint discomfort"}).json()
    portal = next(p for p in body["portals"] if p["sourceId"] == "sample-registry-portal")
    assert portal["notSearchedHere"] is True
    assert portal["url"] == "https://registry.sampleland.invalid/search?q=joint%20discomfort"
    assert portal["termsNote"]


def test_a_portal_with_no_verified_template_carries_no_url(client: TestClient) -> None:
    body = client.get("/api/v1/records/sources").json()
    portal = next(p for p in body["portals"] if p["sourceId"] == "sample-registry-portal")
    # No query supplied, so there is nothing to fill the template with.
    assert portal["url"] is None


# -- the boundary with the answer path ---------------------------------------


def test_the_query_router_serves_no_record_endpoint() -> None:
    from app.api import query as query_router

    paths = {route.path for route in query_router.router.routes}
    assert not any("record" in path for path in paths)


def test_the_records_router_serves_no_answer(client: TestClient) -> None:
    from app.api import records as records_router

    paths = {route.path for route in records_router.router.routes}
    assert all(path.startswith("/api/v1/records") for path in paths)
    assert not any("query" in path or "answer" in path for path in paths)


def test_an_abstention_with_records_beside_it_still_abstains(tmp_path, monkeypatch) -> None:
    """Rule 3, end to end through the API rather than through a unit."""
    store = RecordsStore(tmp_path / "records.sqlite3")
    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    ingest_source(source, store, data_dir=SAMPLES.parent, taken_at=WHEN)

    service = RecordsService(store, SAMPLES)
    monkeypatch.setattr(deps, "get_records_service", lambda: service)
    monkeypatch.setattr("app.api.records.get_records_service", lambda: service)

    settings = Settings(audit_enabled=False)
    from app.llm.fixture import FixtureLLMClient
    from app.retrieval.store import Namespaces
    from app.services.pipeline import Pipeline
    from app.services.translation import PassthroughTranslator

    pipeline = Pipeline(
        settings=settings,
        namespaces=Namespaces(settings.index_dir, settings.fixtures_dir),
        llm=FixtureLLMClient(settings.fixtures_dir),
        translator=PassthroughTranslator(),
        records=service,
    )
    monkeypatch.setattr(deps, "get_pipeline", lambda: pipeline)
    monkeypatch.setattr("app.api.query.get_pipeline", lambda: pipeline)
    deps.get_rate_limiter().reset()

    from app.main import app

    client = TestClient(app)
    # Refused before retrieval, so the corpus cannot have rescued it either —
    # and the wording still names the kind of thing that gets filed, so records
    # are attached beside the decline.
    response = client.post(
        "/api/v1/query",
        json={"text": "How much of our herbal polyherbal formulation should a patient take?"},
    )
    result = next(
        json.loads(line)
        for line in response.text.strip().split("\n")
        if json.loads(line)["event"] == "result"
    )

    assert result["answer"] is None, "the corpus abstained"
    assert result["confidence"]["level"] == "abstain"
    assert result["relatedRecords"], "and records were attached anyway"
    assert all(record["citable_in_answers"] is False for record in result["relatedRecords"])


def test_records_never_reach_the_generator(tmp_path, monkeypatch) -> None:
    """Rule 1, watched rather than asserted about a signature."""
    store = RecordsStore(tmp_path / "records.sqlite3")
    source = RecordsManifest.load(SAMPLES).by_id("sample-registry-applications")
    assert source is not None
    ingest_source(source, store, data_dir=SAMPLES.parent, taken_at=WHEN)
    service = RecordsService(store, SAMPLES)

    settings = Settings(audit_enabled=False)
    from app.llm.fixture import FixtureLLMClient
    from app.retrieval.store import Namespaces
    from app.services.pipeline import Pipeline, QueryRequest, ResultEvent
    from app.services.translation import PassthroughTranslator

    seen: list[str] = []

    class Watching(FixtureLLMClient):
        def generate(self, request):
            seen.append(request.context.prompt_text)
            return super().generate(request)

    pipeline = Pipeline(
        settings=settings,
        namespaces=Namespaces(settings.index_dir, settings.fixtures_dir),
        llm=Watching(settings.fixtures_dir),
        translator=PassthroughTranslator(),
        records=service,
    )

    question = "Is our herbal polyherbal formulation patentable in India?"
    request = QueryRequest(question=question)
    outcome = next(
        event.outcome
        for event in pipeline.run_route(request, pipeline.routes(request)[0])
        if isinstance(event, ResultEvent)
    )

    assert outcome.related_records, "records were found for this question"
    packed = " ".join(seen)
    for record in outcome.related_records:
        assert record.title not in packed
        assert record.record_id not in packed
