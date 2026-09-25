"""Check My Product: what it may conclude, and what it must refuse to.

The promise this file guards is that the product half and the question half of
the system cannot disagree. They read the same classification rules, and neither
is allowed to reach a view on novelty.

T16 as written in the pack tests that nothing reads the commercial dataset. The
owner chose to keep the dataset and remove the verdict instead, so the test that
matters here is the one that check: no state, string or field anywhere tells a
reader their formulation is or might be novel.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.analyst.abs import assess_abs
from app.analyst.facts_bridge import facts_of, missing_from_declines
from app.analyst.intelligence import build
from app.analyst.models import Ingredient, Invention
from app.analyst.protection import RIGHTS, protection_map
from app.analyst.searches import build_strategy
from app.analyst.vocabulary import load_vocabulary
from app.core.settings import REPO_ROOT
from app.models.domain import ProductClass
from app.reasoning.phrases import filter_text
from app.registry.models import ReviewState, SourceRecord
from app.registry.store import SourceRegistry

BACKED = frozenset(
    {"in-drugs-and-cosmetics-act-rules", "in-cdsco", "in-fssai-ayurveda-aahara-2022"}
)


@pytest.fixture(scope="module")
def vocabulary():
    return load_vocabulary()


def product(**overrides) -> Invention:
    fields = {
        "form": "face_pack",
        "intended_use": "for glowing skin, with no therapeutic claim",
        "ingredients": [
            Ingredient(key="neem", name="Neem", vocabulary_id="neem", kind="traditional")
        ],
    }
    fields.update(overrides)
    return Invention(**fields)


def registry_with(tmp_path, ids: list[str]) -> SourceRegistry:
    registry = SourceRegistry(tmp_path / "registry.sqlite3")
    registry.write(
        [
            SourceRecord(
                source_id=source_id,
                title="A document",
                authority="An authority",
                jurisdiction="IN",
                document_type="act",
                authority_level=1,
                official_url="https://ipindia.gov.in/x.pdf",
                review_state=ReviewState.VERIFIED_OFFICIAL,
                sha256="a" * 64,
            )
            for source_id in ids
        ]
    )
    return registry


# -- T16 (as decided): no novelty verdict survives anywhere --------------------

VERDICT = re.compile(
    r"potentially[_ ]novel|high[_ ]similarity|further[_ ]assessment|anticipation[_ ]risk"
    r"|appears? (?:to be )?novel|novelty at risk",
    re.IGNORECASE,
)


#: The one place the old names may still appear: the map that reads an analysis
#: saved before they were renamed. Listing it here rather than loosening the
#: pattern means a second occurrence anywhere still fails.
LEGACY_MAP_FILE = "models.py"


def test_no_novelty_verdict_remains_in_any_interface_string() -> None:
    roots = [
        REPO_ROOT / "frontend" / "src" / "locales",
        REPO_ROOT / "frontend" / "src" / "components" / "analyst",
        REPO_ROOT / "frontend" / "src" / "services",
        REPO_ROOT / "backend" / "app" / "analyst",
    ]
    for root in roots:
        for path in root.rglob("*"):
            if path.suffix not in {".json", ".ts", ".tsx", ".py"} or not path.is_file():
                continue
            text = path.read_text("utf-8")
            if path.name == LEGACY_MAP_FILE and "LEGACY_INDICATORS" in text:
                # Only inside the mapping, and only as the key being migrated
                # away from. Anywhere else in the file still fails.
                text = text.split("LEGACY_INDICATORS")[0] + text.split("}", 1)[-1]
            found = VERDICT.search(text)
            assert not found, f"{path.name} still says: {found.group(0)}"


def test_the_legacy_indicator_map_is_the_only_place_the_old_names_survive() -> None:
    from app.analyst.models import LEGACY_INDICATORS

    assert set(LEGACY_INDICATORS) == {
        "potentially_novel",
        "further_assessment",
        "high_similarity",
    }
    assert all(new not in LEGACY_INDICATORS for new in LEGACY_INDICATORS.values())


def test_the_kept_dataset_still_describes_its_own_limits() -> None:
    # The dataset stays, so the honesty that made it acceptable has to stay too.
    data = json.loads((REPO_ROOT / "corpus" / "products" / "products.json").read_text("utf-8"))
    assert data["verification"].startswith("retrieved_not_reviewed")
    assert "not a market survey" in data["scope"]


def test_a_product_output_contains_no_blocked_verdict_phrase(vocabulary) -> None:
    result = build(product(), vocabulary, corpus_document_ids=BACKED)
    for text in json.dumps(result.model_dump(mode="json"), ensure_ascii=False).split('"'):
        assert filter_text(text).blocked is False


# -- the shared rules decide, here as in Ask ----------------------------------


def test_the_product_is_classified_by_the_shared_rules(vocabulary) -> None:
    result = build(product(), vocabulary, corpus_document_ids=BACKED)
    assert result.classification.product_class is ProductClass.COSMETIC
    assert result.classification.rule_id == "cls-cosmetic"
    assert result.classification.changes_if


def test_with_no_backed_evidence_nothing_is_classified(vocabulary) -> None:
    result = build(product(), vocabulary, corpus_document_ids=frozenset())
    assert result.classification.product_class is ProductClass.UNDETERMINED
    assert result.classification.rule_id is None


def test_a_structured_field_beats_the_prose(vocabulary) -> None:
    # The form says it is taken internally; the description mentions a cream.
    facts = facts_of(product(form="churna", intended_use="thicker than a cream"))
    assert facts.value("external_use") is False


# -- "I don't know" becomes a missing fact ------------------------------------


def test_a_declined_question_becomes_a_missing_fact() -> None:
    missing = missing_from_declines(["intended_use", "source_texts"])
    assert {fact.key for fact in missing} == {"therapeutic_claim", "classical_text_formulation"}
    assert all(fact.question for fact in missing), "and the question is kept, to ask again"


def test_declined_answers_reach_the_result(vocabulary) -> None:
    result = build(product(), vocabulary, declined=["source_texts"], corpus_document_ids=BACKED)
    assert "classical_text_formulation" in {fact.key for fact in result.missing_facts}


# -- the prior-art search builder ---------------------------------------------


def test_the_banner_is_always_present(vocabulary) -> None:
    for invention in (product(), product(ingredients=[]), product(process_steps=["decoction"])):
        strategy = build_strategy(invention, vocabulary)
        assert strategy.banner_key == "priorArtNoConclusion"


def test_a_botanical_name_is_validated_only_from_the_stored_vocabulary(vocabulary) -> None:
    invention = product(
        ingredients=[
            Ingredient(key="neem", name="Neem", vocabulary_id="neem", kind="traditional"),
            Ingredient(key="custom:moonleaf", name="Moonleaf", kind="unrecognised"),
        ]
    )
    strategy = build_strategy(invention, vocabulary)
    validated = {term.text for term in strategy.terms if term.validated}
    assert "azadirachta indica" in validated
    unvalidated = {term.text for term in strategy.terms if not term.validated}
    assert "Moonleaf" in unvalidated, "an unknown name is offered as written, not corrected"
    assert not any(term.kind == "botanical" and term.text == "Moonleaf" for term in strategy.terms)


def test_no_ipc_or_cpc_code_is_ever_produced(vocabulary) -> None:
    strategy = build_strategy(product(process_steps=["cold extraction"]), vocabulary)
    for term in strategy.terms:
        assert not re.match(r"^[A-H]\d{2}[A-Z]", term.text), "IPC codes are not held in this repo"


def test_a_search_page_is_offered_only_when_its_source_is_citable(tmp_path, vocabulary) -> None:
    registry = registry_with(tmp_path, ["in-portal-patent-search"])
    strategy = build_strategy(product(), vocabulary, registry)
    assert {page.source_id for page in strategy.pages} == {"in-portal-patent-search"}


def test_the_tkdl_is_offered_with_its_access_limit(tmp_path, vocabulary) -> None:
    registry = registry_with(tmp_path, ["in-tkdl"])
    strategy = build_strategy(product(), vocabulary, registry)
    assert strategy.tkdl_access_note_key == "tkdlAccessLimited"


# -- ABS ----------------------------------------------------------------------


def test_abs_never_names_a_form_that_is_not_in_the_registry(tmp_path) -> None:
    empty = SourceRegistry(tmp_path / "empty.sqlite3")
    finding = assess_abs({"uses_biological_resource": True}, registry=empty)
    assert finding.source_ids == ()
    assert finding.procedural_notes == ()


def test_abs_offers_only_the_sources_the_registry_holds(tmp_path) -> None:
    registry = registry_with(tmp_path, ["in-bd-amendment-act-2023"])
    finding = assess_abs({"uses_biological_resource": True}, registry=registry)
    assert finding.source_ids == ("in-bd-amendment-act-2023",)


def test_abs_raises_the_question_and_leaves_the_definition_to_a_person() -> None:
    finding = assess_abs({"uses_biological_resource": True})
    assert finding.relevance == "likely"
    assert finding.requires_human_review is True


def test_abs_asks_only_material_questions() -> None:
    finding = assess_abs({})
    keys = {fact.key for fact in finding.missing_facts}
    assert "uses_biological_resource" in keys
    assert "applicant_is_foreign" in keys
    assert len(keys) <= 7, "the intake stays short; nothing is asked that does not decide anything"


def test_no_biological_resource_means_abs_is_not_indicated() -> None:
    finding = assess_abs({"uses_biological_resource": False})
    assert finding.relevance == "not_indicated"
    assert finding.requires_human_review is False


# -- the IP protection map ----------------------------------------------------


def test_every_right_is_reported(vocabulary) -> None:
    entries = protection_map(product(), facts_of(product()))
    assert [entry.right for entry in entries] == list(RIGHTS)


def test_not_indicated_and_needs_more_information_are_different(vocabulary) -> None:
    entries = {e.right: e for e in protection_map(product(), facts_of(product()))}
    # No brand was given and none was asked about, so the position is unknown.
    assert entries["trademark"].relevance == "needs_more_information"
    assert entries["trademark"].facts_required

    named = product(brand_name="GlowVeda")
    with_brand = {e.right: e for e in protection_map(named, facts_of(named))}
    assert with_brand["trademark"].relevance == "relevant"


def test_a_right_ruled_out_by_the_facts_says_not_indicated() -> None:
    public = product(disclosure="public")
    entries = {e.right: e for e in protection_map(public, facts_of(public))}
    assert entries["trade_secret"].relevance == "not_indicated"


def test_every_entry_carries_why_and_a_source_or_a_question() -> None:
    for entry in protection_map(product(), facts_of(product())):
        assert entry.reason_keys
        assert entry.source_ids or entry.facts_required or entry.relevance == "not_indicated"


# -- the roadmap seed ---------------------------------------------------------


def test_the_roadmap_starts_with_settling_what_the_product_is(vocabulary) -> None:
    # Everything downstream depends on the category, so it comes first and the
    # rest wait on it.
    result = build(product(), vocabulary, corpus_document_ids=BACKED)
    first = result.roadmap[0]
    assert first.task_id == "confirm-classification"
    assert first.when == "now"
    assert first.why_key


def test_abs_lands_before_filing_not_after(vocabulary) -> None:
    result = build(product(), vocabulary, corpus_document_ids=BACKED)
    abs_task = next(t for t in result.roadmap if t.task_id == "determine-abs-applicability")
    assert abs_task.when == "before_filing"
    # It cannot be done until the origin of the material is written down.
    assert "document-resource-origin" in abs_task.depends_on


def test_no_roadmap_task_can_claim_a_filing_or_an_approval(vocabulary) -> None:
    from app.analyst.roadmap import FORBIDDEN_STATUSES

    result = build(product(), vocabulary, corpus_document_ids=BACKED)
    assert result.roadmap
    for task in result.roadmap:
        assert task.status not in FORBIDDEN_STATUSES


def test_the_whole_result_serialises_for_the_api(vocabulary) -> None:
    result = build(product(brand_name="GlowVeda"), vocabulary, corpus_document_ids=BACKED)
    payload = result.model_dump(mode="json")
    assert Path is not None  # keeps the import honest
    assert payload["searches"]["banner_key"] == "priorArtNoConclusion"
    assert payload["classification"]["product_class"] == "cosmetic"
