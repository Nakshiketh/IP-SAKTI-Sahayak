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
from app.api import analyst
from app.api.deps import get_rate_limiter
from app.auth import sessions
from app.main import app
from tests.members import CSRF, make_member

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


# Real sessions: whose analysis is whose is part of what is tested here.
pytestmark = pytest.mark.real_auth


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(analyst, "_db_path", lambda: tmp_path / "analyses.sqlite3")
    get_rate_limiter().reset()
    return TestClient(app)


def token(client: TestClient, member: dict | None = None) -> dict:
    """Headers carrying a live session for `member` (a new one if not given)."""
    member = member or make_member()
    signing_in = TestClient(app, headers=CSRF)
    response = signing_in.post(
        "/api/v1/auth/login",
        json={"identifier": member["username"], "password": member["password"]},
    )
    assert response.status_code == 200, response.text
    raw = signing_in.cookies.get(sessions.COOKIE_NAME)
    return {"Cookie": f"{sessions.COOKIE_NAME}={raw}", **CSRF}


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
    assert analysis["assessment"]["indicator"] != "nothing_found_in_sources_searched"
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
    assert "no patent records are held on this site" in last_reply(step).lower()

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

    other = token(client)
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


# -- the Traditional Knowledge Digital Library ----------------------------------


def test_tkdl_reference_holds_only_its_public_book_lists() -> None:
    from app.analyst.tkdl import TKDL_PATH, get_tkdl

    raw = json.loads(TKDL_PATH.read_text(encoding="utf-8"))
    # The counts TKDL's own Source of Information page states.
    assert {k: len(v) for k, v in raw["books"].items()} == {
        "Ayurveda": 119,
        "Unani": 55,
        "Siddha": 91,
        "Sowa-Rigpa": 1,
    }
    # Bibliographic fields only: no formulation, composition or record content.
    for rows in raw["books"].values():
        for row in rows:
            assert set(row) == {"title", "author", "edition"}
    for page in raw["pages"]:
        assert page["url"].startswith("https://www.tkdl.res.in/")
    assert get_tkdl().book_count == 266


def test_tkdl_recognises_named_classical_texts_and_nothing_else() -> None:
    from app.analyst.tkdl import get_tkdl

    tkdl = get_tkdl()
    found = {w.name for w in tkdl.find("A lepa from Ashtanga Hridayam, as in Bhaishajya Ratnavali")}
    assert found == {"Bhaishajya Ratnavali", "Ashtanga Hridaya"}
    assert [w.name for w in tkdl.find("Charaka Samhita")] == ["Charaka Samhita"]
    assert tkdl.find(SAMPLE) == []


def test_a_named_classical_text_reaches_the_findings(client: TestClient) -> None:
    headers = token(client)
    cid = client.post("/api/v1/analyst/conversations", headers=headers).json()["id"]
    turn(client, headers, cid, SAMPLE)
    step = turn(client, headers, cid, "It is adapted from a lepa in Ashtanga Hridayam.")
    assert step["invention"]["source_texts"] == ["Ashtanga Hridaya"]

    step = turn(client, headers, cid, "Run the analysis again")
    knowledge = step["analysis"]["knowledge"]
    assert knowledge["tkdl_searched"] is False
    assert [t["name"] for t in knowledge["tkdl"]["texts"]] == ["Ashtanga Hridaya"]
    assert knowledge["tkdl"]["texts"][0]["list_url"].startswith("https://www.tkdl.res.in/")
    assert any(n["code"] == "tkdl_text_named" for n in knowledge["notes"])
    reasons = [r["code"] for r in step["analysis"]["assessment"]["reasons"]]
    assert "tkdl_source_text" in reasons
    assert step["analysis"]["assessment"]["indicator"] != "nothing_found_in_sources_searched"


def test_asking_about_the_tkdl_is_answered_from_its_public_pages(client: TestClient) -> None:
    headers = token(client)
    cid = client.post("/api/v1/analyst/conversations", headers=headers).json()["id"]
    turn(client, headers, cid, SAMPLE)
    reply = last_reply(turn(client, headers, cid, "Is my formulation in the TKDL?"))
    assert "TKDL Access Agreement" in reply
    assert "representative database" in reply


def test_a_rerun_command_is_not_taken_as_an_answer(client: TestClient) -> None:
    headers = token(client)
    cid = client.post("/api/v1/analyst/conversations", headers=headers).json()["id"]
    step = turn(client, headers, cid, SAMPLE)
    step = turn(client, headers, cid, "skip")
    step = turn(client, headers, cid, "Run the analysis again")
    assert step["invention"]["process_steps"] == []
    assert step["analysis"] is not None


def test_not_been_sold_is_read_as_confidential() -> None:
    reading = read(
        "It has not been sold or published yet.", Invention(), "novelty", get_vocabulary()
    )
    assert reading.fields.get("disclosure") == "confidential"
    assert reading.add_features == []


def test_an_answer_to_something_else_is_not_filed_under_the_last_question() -> None:
    vocabulary = get_vocabulary()
    reading = read(
        "We ran a patch test on 20 volunteers and a 6-month stability test.",
        Invention(),
        "process",
        vocabulary,
    )
    assert reading.fields.get("evidence")
    assert reading.add_steps == []
    reading = read(
        "We will sell it under the brand name Kesari Aura", Invention(), "problem", vocabulary
    )
    assert reading.fields.get("brand_name") == "Kesari Aura"
    assert "problem" not in reading.fields


def test_an_analysis_saved_under_the_old_indicator_names_still_loads() -> None:
    """A renamed literal must not take the whole surface down.

    The three states were renamed when the novelty verdict was removed. Stored
    analyses kept the old names, and because the list of conversations is built
    by validating every row, one old row stopped Check My Product loading at
    all — not one entry, the page. Old names are read as their new equivalent.
    """
    from app.analyst.models import ConversationSummary, RunSummary, read_indicator

    assert read_indicator("further_assessment") == "related_material_found"
    assert read_indicator("potentially_novel") == "nothing_found_in_sources_searched"
    assert read_indicator("high_similarity") == "match_in_public_sources"
    # An unknown value is passed through, so the model still rejects nonsense.
    assert read_indicator("match_in_public_sources") == "match_in_public_sources"

    summary = ConversationSummary(
        id="c1",
        title="A product",
        created_at=1.0,
        updated_at=2.0,
        indicator="further_assessment",
        ingredient_count=3,
    )
    assert summary.indicator == "related_material_found"

    run = RunSummary(
        id=1,
        created_at=1.0,
        trigger="first run",
        indicator="potentially_novel",
        product_matches=0,
        patent_matches=0,
    )
    assert run.indicator == "nothing_found_in_sources_searched"
