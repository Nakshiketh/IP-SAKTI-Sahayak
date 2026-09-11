"""The invention analyst, walked through the way an inventor walks it.

The sample is the Ayurvedic Turmeric-Neem Face Pack. Nothing here is stubbed: the
products come from the committed reference set, the records store is whatever the
instance has (nothing, by default), and the assertions are about what may honestly
be said back.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.analyst.evidence import PRODUCTS_PATH
from app.analyst.models import Invention
from app.analyst.reader import parse_quantified, read
from app.analyst.vocabulary import get_vocabulary
from app.api import analyst, auth
from app.api.deps import get_rate_limiter
from app.main import app

SAMPLE = """Ayurvedic Turmeric–Neem Face Pack
For 100 g:
- Multani Mitti — 40 g — 40%
- Gram Flour (Besan) — 25 g — 25%
- Turmeric (Haldi) — 10 g — 10%
- Neem Powder — 10 g — 10%
- Sandalwood Powder — 10 g — 10%
- Rose Powder — 5 g — 5%
Purpose:
Traditional skin cleansing, oil absorption, soothing and skin-care use."""


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(auth, "_db_path", lambda: tmp_path / "accounts.sqlite3")
    monkeypatch.setattr(auth, "PBKDF2_ROUNDS", 1_000)
    monkeypatch.setattr(analyst, "_db_path", lambda: tmp_path / "analyses.sqlite3")
    get_rate_limiter().reset()
    return TestClient(app)


def token(client: TestClient, username: str = "demo", password: str = "demo1234") -> dict:
    body = client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    ).json()
    return {"Authorization": "Bearer " + body["token"]}


def turn(client: TestClient, headers: dict, conversation_id: str, text: str) -> dict:
    response = client.post(
        f"/api/v1/analyst/conversations/{conversation_id}/messages",
        json={"text": text},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
    assert [e["id"] for e in events if e["event"] == "stage"][:2] == ["understand", "extract"]
    result = events[-1]
    assert result["event"] == "result"
    return result["conversation"]


def last_reply(conversation: dict) -> str:
    return conversation["messages"][-1]["text"]


def test_the_sample_face_pack_journey(client: TestClient) -> None:
    headers = token(client)
    conversation = client.post("/api/v1/analyst/conversations", headers=headers).json()
    cid = conversation["id"]

    step = turn(client, headers, cid, "I developed a face-pack formulation.")
    assert step["invention"]["form"] == "face_pack"
    assert "ingredients" in last_reply(step).lower()
    assert step["analysis"] is None

    step = turn(
        client,
        headers,
        cid,
        "Neem 10%, Turmeric 10%, Multani Mitti 40%, Besan 25%, Sandalwood 10%, Rose powder 5%.",
    )
    keys = [i["key"] for i in step["invention"]["ingredients"]]
    assert keys == ["neem", "turmeric", "multani_mitti", "besan", "chandana", "rose"]
    assert "what is it for" in last_reply(step).lower()

    step = turn(
        client,
        headers,
        cid,
        "Traditional skin cleansing, oil absorption, soothing and skin-care use.",
    )
    analysis = step["analysis"]
    assert analysis is not None
    assert {"cleansing", "oil_control", "soothing"} <= set(step["invention"]["use_terms"])

    products = analysis["products"]
    assert products["matches"], "face packs sharing these ingredients are in the reference set"
    names = {m["product_id"] for m in products["matches"]}
    assert "himalaya-purifying-neem-pack" in names
    for match in products["matches"]:
        assert match["sources"] and all(s["url"].startswith("https://") for s in match["sources"])

    # Nothing loaded means nothing searched, and the indicator cannot be green.
    assert analysis["prior_art"]["state"] == "not_loaded"
    assert analysis["prior_art"]["registries_not_searched"]
    assert analysis["assessment"]["indicator"] != "potentially_novel"
    assert "patentable" not in json.dumps(analysis).lower()
    assert analysis["knowledge"]["tkdl_searched"] is False

    # A correction updates the formulation and re-runs the searches.
    asked_before = step["messages"][-1]["meta"].get("asking")
    step = turn(client, headers, cid, "I changed Neem from 10% to 5% and added Rice flour 5%.")
    by_key = {i["key"]: i for i in step["invention"]["ingredients"]}
    assert by_key["neem"]["percent"] == 5
    assert by_key["rice_flour"]["percent"] == 5
    assert "products" in step["analysis"]["reran"]
    assert step["messages"][-1]["meta"].get("asking") != asked_before or asked_before is None

    step = turn(client, headers, cid, "Why is the Himalaya pack similar?")
    assert "Purifying Neem Pack" in last_reply(step)

    step = turn(client, headers, cid, "Why is a patent relevant?")
    assert "no patent records are loaded" in last_reply(step).lower()

    step = turn(client, headers, cid, "What makes mine different?")
    assert "not automatically patentable" in last_reply(step)

    assert len(step["history"]) >= 2


def test_the_whole_sample_in_one_message_is_analysed_at_once(client: TestClient) -> None:
    headers = token(client)
    cid = client.post("/api/v1/analyst/conversations", headers=headers).json()["id"]
    step = turn(client, headers, cid, SAMPLE)
    invention = step["invention"]
    assert invention["title"].startswith("Ayurvedic Turmeric")
    assert len(invention["ingredients"]) == 6
    assert sum(i["percent"] for i in invention["ingredients"]) == 100
    assert invention["batch_size"] == {"value": 100.0, "unit": "g"}
    assert step["analysis"] is not None


def test_an_answered_question_is_not_asked_again(client: TestClient) -> None:
    headers = token(client)
    cid = client.post("/api/v1/analyst/conversations", headers=headers).json()["id"]
    step = turn(client, headers, cid, SAMPLE)
    first = step["messages"][-1]["meta"]["asking"]
    step = turn(client, headers, cid, "skip")
    second = step["messages"][-1]["meta"].get("asking")
    assert second != first
    asked = {m["meta"].get("asking") for m in step["messages"] if m["role"] == "assistant"} - {None}
    assert len(asked) == len([m for m in step["messages"] if m["meta"].get("asking")])


def test_an_analysis_belongs_to_its_account(client: TestClient) -> None:
    headers = token(client)
    cid = client.post("/api/v1/analyst/conversations", headers=headers).json()["id"]
    assert client.get(f"/api/v1/analyst/conversations/{cid}").status_code == 401

    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Other",
            "email": "o@example.com",
            "username": "other",
            "password": "password1",
        },
    )
    other = token(client, "other", "password1")
    assert client.get(f"/api/v1/analyst/conversations/{cid}", headers=other).status_code == 404
    assert client.delete(f"/api/v1/analyst/conversations/{cid}", headers=headers).status_code == 204
    assert client.get(f"/api/v1/analyst/conversations/{cid}", headers=headers).status_code == 404


def test_reader_keeps_look_alike_herbs_apart() -> None:
    vocabulary = get_vocabulary()
    assert vocabulary.recognise("Daru Haldi (Berberis Aristata)").id == "daruharidra"
    assert vocabulary.recognise("Rakta chandan (Pterocarpus Santalinus)").id == "rakta_chandana"
    assert vocabulary.recognise("Turmeric (Haldi)").id == "turmeric"


def test_reader_parses_quantities_both_ways() -> None:
    vocabulary = get_vocabulary()
    [item] = parse_quantified("Multani Mitti - 40 g - 40%", vocabulary)
    assert (item.name, item.amount.value, item.percent) == ("Multani Mitti", 40, 40)
    [item] = parse_quantified("10 g of neem powder", vocabulary)
    assert item.name.lower() == "neem powder" and item.amount.value == 10


def test_a_removal_of_something_not_listed_is_reported_not_invented() -> None:
    reading = read("remove the saffron", Invention(), None, get_vocabulary())
    assert reading.remove == [] and reading.unmatched_removals == ["Saffron"]


def test_every_product_carries_a_fetched_source() -> None:
    data = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    assert data["products"]
    for product in data["products"]:
        assert product["sources"], product["product_id"]
        for source in product["sources"]:
            assert source["url"].startswith("https://")
            assert source["retrieved_at"] == data["retrieved_at"]
            assert source["excerpt"]
        for ingredient in product["ingredients"]:
            if ingredient.get("amount"):
                assert product["composition_basis"], product["product_id"]
