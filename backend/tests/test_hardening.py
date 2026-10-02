"""The test catalogue, and the hardening pass that closes what it does not cover.

Two jobs. First, an index: the eighteen guarantees the upgrade pack names, each
mapped to the test that actually holds it, so the catalogue cannot quietly rot
into a list of numbers nobody implements. Second, the hardening items from Phase
10 that were not already covered somewhere else.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.settings import REPO_ROOT
from app.corpus import fetch
from app.registry.hosts import is_allowlisted

TESTS = Path(__file__).parent

#: T-number -> (file, a test function that holds it).
#:
#: T9 said, until uploads were built, that what was tested was the guarantee
#: underneath the pack's wording — a source from a host nobody vetted can never
#: be cited, whatever route it arrives by — and that when uploads existed this
#: entry should grow a second test rather than be reinterpreted. Uploads exist,
#: and it has: `CATALOGUE_EXTRA` holds the second.
CATALOGUE: dict[str, tuple[str, str]] = {
    "T1": ("test_reasoning_cases.py", "test_d_and_t1_india_and_international_never_merge"),
    "T2": ("test_registry.py", "test_a_portal_page_never_outranks_a_statute"),
    "T3": ("test_registry.py", "test_no_interface_string_claims_the_tkdl_database_was_searched"),
    "T4": ("test_registry.py", "test_a_claim_citing_a_passage_that_was_never_shown_is_dropped"),
    "T5": ("test_reasoning.py", "test_missing_material_facts_step_confidence_down"),
    "T6": (
        "test_reasoning.py",
        "test_a_pair_from_different_authority_levels_resolves_by_authority",
    ),
    "T7": ("test_reasoning.py", "test_an_unresolved_true_conflict_escalates_to_l3"),
    "T8": ("test_reasoning_cases.py", "test_d_and_t1_india_and_international_never_merge"),
    "T9": ("test_registry.py", "test_a_source_from_an_unlisted_host_is_never_citable"),
    "T10": ("test_voice.py", "test_voice_and_text_reach_the_same_safety_outcome"),
    "T11": ("test_flagship.py", "test_the_seeded_case_holds_no_answer"),
    "T12": ("test_reasoning_cases.py", "test_t12_an_unsupported_jurisdiction_is_named_not_guessed"),
    "T13": (
        "test_reasoning_cases.py",
        "test_b_tk_and_a_new_process_raise_both_issues_without_a_verdict",
    ),
    "T14": ("test_reasoning_cases.py", "test_h_and_t14_a_dosage_question_is_out_of_scope"),
    "T15": ("test_registry.py", "test_a_citation_carries_its_review_state_and_date"),
    "T16": (
        "test_product_intelligence.py",
        "test_no_novelty_verdict_remains_in_any_interface_string",
    ),
    "T17": ("test_workspace.py", "test_asking_a_question_never_returns_a_saved_case"),
    "T18": ("test_insight.py", "test_the_audit_log_stores_a_hash_and_never_the_question"),
}


@pytest.mark.parametrize("number", sorted(CATALOGUE, key=lambda key: int(key[1:])))
def test_the_named_guarantee_has_a_test_that_holds_it(number: str) -> None:
    """Every T-number in the pack maps to a test that exists.

    A catalogue nobody checks becomes a list of numbers with nothing behind
    them, and the first anyone knows is when a guarantee everyone believed in
    turns out never to have been written down.
    """
    filename, function = CATALOGUE[number]
    path = TESTS / filename
    assert path.exists(), f"{number}: {filename} is missing"
    assert f"def {function}(" in path.read_text("utf-8"), f"{number}: {function} is missing"


#: Where one T-number is held by more than one test. A dict cannot hold two
#: values for a key, and dropping either test to fit the shape would be the
#: catalogue deciding what is true rather than recording it.
CATALOGUE_EXTRA: dict[str, tuple[str, str]] = {
    "T9": ("test_documents.py", "test_an_uploaded_document_is_never_a_source"),
    "T10": ("test_voice.py", "test_the_document_channel_changes_nothing_either"),
}


@pytest.mark.parametrize("number", sorted(CATALOGUE_EXTRA))
def test_a_guarantee_with_a_second_route_has_a_second_test(number: str) -> None:
    filename, function = CATALOGUE_EXTRA[number]
    path = TESTS / filename
    assert path.exists(), f"{number}: {filename} is missing"
    assert f"def {function}(" in path.read_text("utf-8"), f"{number}: {function} is missing"


def test_every_t_number_from_one_to_eighteen_is_accounted_for() -> None:
    assert sorted(CATALOGUE, key=lambda key: int(key[1:])) == [f"T{n}" for n in range(1, 19)]


# -- SSRF: the server fetches official hosts or nothing ------------------------


def test_the_corpus_fetcher_refuses_a_host_nobody_vetted() -> None:
    """A fetcher that retrieves any URL handed to it is one edit away from
    being a way to make the server request an internal address.
    """
    with pytest.raises(ValueError, match="not on the official allowlist"):
        fetch._read_http("http://169.254.169.254/latest/meta-data/")  # noqa: SLF001


def test_the_corpus_fetcher_refuses_a_plausible_look_alike() -> None:
    with pytest.raises(ValueError, match="allowlist"):
        fetch._read_http("https://notipindia.gov.in/patents.pdf")  # noqa: SLF001


def test_every_server_side_fetch_checks_the_allowlist() -> None:
    # verify.py and health.py already did; fetch.py was the gap this closed.
    for module in ("corpus/fetch.py", "registry/verify.py", "registry/health.py"):
        source = (REPO_ROOT / "backend" / "app" / module).read_text("utf-8")
        assert "is_allowlisted" in source, f"{module} fetches without checking the host"


def test_an_internal_address_is_not_allowlisted() -> None:
    for url in (
        "http://localhost:8000/api/v1/query",
        "http://127.0.0.1/",
        "http://169.254.169.254/",
        "http://[::1]/",
        "file:///etc/passwd",
    ):
        assert not is_allowlisted(url), url


# -- no raw HTML anywhere in the interface ------------------------------------


def test_the_interface_never_renders_raw_html() -> None:
    """Passages and answers are text from documents. Rendered as HTML, a source
    could style the page, and a hostile one could do worse.
    """
    root = REPO_ROOT / "frontend" / "src"
    for path in root.rglob("*.tsx"):
        source = path.read_text("utf-8")
        assert "dangerouslySetInnerHTML" not in source, path.name
        assert ".innerHTML" not in source, path.name


def test_a_citation_link_is_rendered_only_for_https() -> None:
    card = (REPO_ROOT / "frontend" / "src" / "components" / "answer" / "SourceCard.tsx").read_text(
        "utf-8"
    )
    # The link and the host both come from the same check, so a non-https URL
    # cannot render as an anchor.
    assert "protocol !== 'https:'" in card
    assert "citation.url && sourceHost(citation.url)" in card


# -- secrets stay out of the repository ---------------------------------------


def test_no_credential_is_committed() -> None:
    import re

    pattern = re.compile(
        r"(api[_-]?key|secret|token)\s*[=:]\s*['\"][A-Za-z0-9_/+\-]{20,}['\"]", re.IGNORECASE
    )
    for root in (REPO_ROOT / "backend" / "app", REPO_ROOT / "frontend" / "src"):
        for path in root.rglob("*"):
            if path.suffix not in {".py", ".ts", ".tsx"} or not path.is_file():
                continue
            found = pattern.search(path.read_text("utf-8"))
            assert not found, f"{path.name}: {found.group(0)[:40]}"


def test_member_passwords_are_hashed_with_argon2id() -> None:
    hashing = (REPO_ROOT / "backend" / "app" / "auth" / "hashing.py").read_text("utf-8")
    assert "from argon2 import PasswordHasher" in hashing
    # No password is written anywhere in the source, and none is seeded from it:
    # the demo member's password comes from the environment.
    members = (REPO_ROOT / "backend" / "app" / "auth" / "members.py").read_text("utf-8")
    assert "hash_password(password)" in members
    assert "password = permanent_password or temporary_password" in members
    assert "demo1234" not in (REPO_ROOT / "backend" / "app" / "api" / "auth.py").read_text("utf-8")
