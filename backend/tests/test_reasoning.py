"""The reasoning stage, held to what it promises about its own limits.

These are unit tests over the rules themselves: facts read only from what was
written, a category decided only by backed rules, a conflict typed only from
metadata, and a confidence that steps down for reasons it can name.

Test ids from the upgrade pack: T5, T6, T7, plus the escalation mapping and the
blocked-phrase filter.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models.domain import (
    AbstainCode,
    Confidence,
    ConflictType,
    EscalationLevel,
    IPRight,
    IssueStatus,
    IssueType,
    Jurisdiction,
    ProductClass,
    ResolutionStatus,
    VerificationStatus,
)
from app.reasoning import analyse
from app.reasoning.classify import classify
from app.reasoning.confidence import IssueSignals, score_issue
from app.reasoning.conflicts import from_pairs, jurisdictional
from app.reasoning.escalation import decide
from app.reasoning.facts import extract_facts
from app.reasoning.phrases import filter_text
from app.reasoning.rules import (
    get_fact_rules,
    load_classification_rules,
    load_confidence_rules,
    load_fact_rules,
)
from app.registry.models import ReviewState, SourceRecord
from app.registry.store import SourceRegistry
from app.retrieval.types import IndexedChunk, ScoredChunk

ALL_DOCUMENTS = frozenset(
    {
        "in-drugs-and-cosmetics-act-rules",
        "in-cdsco",
        "in-fssai-ayurveda-aahara-2022",
    }
)


def chunk(
    chunk_id: str,
    *,
    document_id: str = "doc-a",
    jurisdiction: Jurisdiction = Jurisdiction.IN,
    effective_from: date | None = None,
    superseded_by: str | None = None,
    ip_rights: tuple[IPRight, ...] = (),
) -> ScoredChunk:
    return ScoredChunk(
        chunk=IndexedChunk(
            chunk_id=chunk_id,
            document_id=document_id,
            document_title="A document",
            organization="An authority",
            jurisdiction=jurisdiction,
            text="Some provision.",
            verification_status=VerificationStatus.VERIFIED,
            effective_from=effective_from,
            superseded_by=superseded_by,
            ip_rights=ip_rights,
        ),
        retrieval_score=1.0,
        rerank_score=0.9,
    )


def registry_with(tmp_path, levels: dict[str, int]) -> SourceRegistry:
    registry = SourceRegistry(tmp_path / "registry.sqlite3")
    registry.write(
        [
            SourceRecord(
                source_id=source_id,
                title="A document",
                authority="An authority",
                jurisdiction=Jurisdiction.IN,
                document_type="act",
                authority_level=level,
                official_url="https://ipindia.gov.in/x.pdf",
                review_state=ReviewState.VERIFIED_OFFICIAL,
                sha256="a" * 64,
            )
            for source_id, level in levels.items()
        ]
    )
    return registry


# -- facts: only what was written ---------------------------------------------


def test_a_fact_is_read_only_when_the_question_states_it() -> None:
    facts = extract_facts("Can I patent a herbal formulation?")
    assert facts.value("uses_biological_resource") is True
    # Nothing was said about a therapeutic claim, so nothing is recorded.
    assert facts.value("therapeutic_claim") is None
    assert "therapeutic_claim" in facts.unknown


def test_a_negated_phrase_states_the_opposite_fact() -> None:
    assert extract_facts("It has never been sold.").value("publicly_disclosed") is False
    assert (
        extract_facts("We launched it last year; it is on sale.").value("publicly_disclosed")
        is True
    )


def test_every_stated_fact_keeps_the_readers_own_words() -> None:
    facts = extract_facts("Our product is a face pack made from herbs.")
    external = next(fact for fact in facts.stated if fact.key == "external_use")
    assert "face pack" in external.span.lower()


def test_the_fact_rules_load_their_yes_and_no_phrases() -> None:
    # PyYAML turns bare `yes:` and `no:` keys into booleans; if that regressed,
    # every negative phrase would silently vanish and facts would only ever be
    # true.
    rules = load_fact_rules()
    assert rules.definitions["publicly_disclosed"].no_phrases
    assert rules.definitions["external_use"].no_phrases


# -- classification: rules decide, and only backed rules ----------------------


def test_a_rule_without_usable_evidence_cannot_classify_anything() -> None:
    rules, material = load_classification_rules(frozenset())
    assert all(not rule.active for rule in rules)
    assert all(rule.inactive_reason for rule in rules)

    facts = extract_facts("A purified standardised extract that treats fever, taken orally.")
    assert classify(facts, rules, material).product_class is ProductClass.UNDETERMINED


def test_an_unknown_required_fact_does_not_fire_the_rule() -> None:
    rules, material = load_classification_rules(ALL_DOCUMENTS)
    # Nothing here says whether it follows a classical text.
    result = classify(extract_facts("We sell a herbal product."), rules, material)
    assert result.product_class is ProductClass.UNDETERMINED
    assert {fact.key for fact in result.missing_facts} >= {"classical_text_formulation"}


def test_a_classification_names_what_would_change_it() -> None:
    rules, material = load_classification_rules(ALL_DOCUMENTS)
    facts = extract_facts(
        "A herbal face pack for glowing skin, applied to the skin, with no therapeutic claim."
    )
    result = classify(facts, rules, material)
    assert result.product_class is ProductClass.COSMETIC
    assert result.changes_if and "therapeutic claim" in result.changes_if


# -- T6: conflicting sources produce a Conflict object ------------------------


def test_a_pair_from_different_authority_levels_resolves_by_authority(tmp_path) -> None:
    registry = registry_with(tmp_path, {"act": 1, "portal": 3})
    passages = [chunk("c1", document_id="act"), chunk("c2", document_id="portal")]
    conflict = from_pairs((("c1", "c2"),), passages, registry)[0]
    assert conflict.conflict_type is ConflictType.AUTHORITY
    assert conflict.resolution_status is ResolutionStatus.RESOLVED_BY_AUTHORITY
    assert conflict.governing_source == "c1"
    assert conflict.reasoning_basis == "authority_level"
    assert conflict.requires_human_review is False


def test_a_superseded_source_resolves_by_date(tmp_path) -> None:
    registry = registry_with(tmp_path, {"old": 1, "new": 1})
    passages = [chunk("c1", document_id="old", superseded_by="new"), chunk("c2", document_id="new")]
    conflict = from_pairs((("c1", "c2"),), passages, registry)[0]
    assert conflict.conflict_type is ConflictType.TEMPORAL
    assert conflict.resolution_status is ResolutionStatus.RESOLVED_BY_DATE
    assert conflict.governing_source == "c2"


def test_two_jurisdictions_are_separate_obligations_not_a_contest() -> None:
    conflict = jurisdictional(IssueType.PATENT, Jurisdiction.INTL)
    assert conflict.conflict_type is ConflictType.JURISDICTIONAL
    assert conflict.resolution_status is ResolutionStatus.SEPARATE_OBLIGATIONS


def test_equal_authority_on_the_same_date_is_a_true_conflict(tmp_path) -> None:
    registry = registry_with(tmp_path, {"a": 1, "b": 1})
    same = date(2020, 1, 1)
    passages = [
        chunk("c1", document_id="a", effective_from=same, ip_rights=(IPRight.PATENT,)),
        chunk("c2", document_id="b", effective_from=same, ip_rights=(IPRight.PATENT,)),
    ]
    conflict = from_pairs((("c1", "c2"),), passages, registry)[0]
    assert conflict.conflict_type is ConflictType.TRUE_SOURCE_CONFLICT
    assert conflict.resolution_status is ResolutionStatus.UNRESOLVED
    assert conflict.requires_human_review is True


def test_a_conflict_is_never_invented_from_wording(tmp_path) -> None:
    registry = registry_with(tmp_path, {"a": 1, "b": 1})
    passages = [chunk("c1", document_id="a"), chunk("c2", document_id="b")]
    # No pair was recorded by ingestion, so nothing is reported however the
    # passages read.
    assert from_pairs((), passages, registry) == []


# -- T5: missing material facts lower confidence ------------------------------


def test_missing_material_facts_step_confidence_down() -> None:
    rules = load_confidence_rules()
    sure = score_issue(IssueSignals(IssueType.PATENT, has_primary_authority=True), rules)
    thinner = score_issue(
        IssueSignals(IssueType.PATENT, has_primary_authority=True, missing_material_facts=True),
        rules,
    )
    assert sure.level is Confidence.HIGH
    assert thinner.level is Confidence.MODERATE
    assert "issueMissingFacts" in thinner.reason_keys


def test_each_factor_steps_down_once_and_the_reasons_are_named() -> None:
    rules = load_confidence_rules()
    scored = score_issue(
        IssueSignals(
            IssueType.PATENT,
            has_primary_authority=False,
            citation_removed=True,
            missing_material_facts=True,
        ),
        rules,
    )
    assert scored.level is Confidence.LOW
    assert len(scored.reason_keys) == 3


def test_a_cap_never_raises_confidence() -> None:
    rules = load_confidence_rules()
    scored = score_issue(
        IssueSignals(
            IssueType.PATENT,
            has_primary_authority=False,
            citation_removed=True,
            missing_material_facts=True,
            # The cap sits at moderate; the level is already low.
            partial_jurisdiction_coverage=True,
        ),
        rules,
    )
    assert scored.level is Confidence.LOW


def test_no_usable_source_is_not_a_low_confidence_but_no_confidence() -> None:
    scored = score_issue(IssueSignals(IssueType.PATENT, no_usable_source=True))
    assert scored.level is None


# -- T7: an unresolved conflict triggers escalation ---------------------------


def test_an_unresolved_true_conflict_escalates_to_l3(tmp_path) -> None:
    registry = registry_with(tmp_path, {"a": 1, "b": 1})
    same = date(2020, 1, 1)
    passages = [
        chunk("c1", document_id="a", effective_from=same),
        chunk("c2", document_id="b", effective_from=same),
    ]
    conflicts = from_pairs((("c1", "c2"),), passages, registry)
    escalation = decide([], conflicts)
    assert escalation.level is EscalationLevel.L3
    assert "escalationTrueSourceConflict" in escalation.reason_keys


def test_escalation_levels_map_as_documented() -> None:
    assert decide([], []).level is EscalationLevel.L0
    assert decide([], [], missing_facts=True).level is EscalationLevel.L1

    low = score_issue(
        IssueSignals(
            IssueType.PATENT,
            has_primary_authority=False,
            citation_removed=True,
            missing_material_facts=True,
        )
    )
    assert decide([low], []).level is EscalationLevel.L2

    verdict = decide([], [], abstain_code=AbstainCode.REQUEST_FOR_LEGAL_VERDICT)
    assert verdict.level is EscalationLevel.L3


def test_escalation_names_a_type_of_specialist_never_a_firm() -> None:
    low = score_issue(
        IssueSignals(
            IssueType.BIODIVERSITY_ABS,
            has_primary_authority=False,
            citation_removed=True,
            missing_material_facts=True,
        )
    )
    escalation = decide([low], [])
    assert escalation.specialists == ["biodiversity_abs_consultant"]


def test_l0_offers_nobody() -> None:
    assert decide([], []).specialists == []


# -- the blocked-phrase filter ------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Your patent is guaranteed.",
        "This is 100% legal.",
        "The application cannot be rejected.",
    ],
)
def test_a_promise_about_an_outcome_is_blocked(text: str) -> None:
    assert filter_text(text).blocked is True


def test_a_phrase_with_a_neutral_form_is_rewritten_not_blocked() -> None:
    filtered = filter_text("The application will be granted after examination.")
    assert filtered.blocked is False
    assert "will be granted" not in filtered.text
    assert filtered.matched


def test_ordinary_guidance_passes_through_untouched() -> None:
    text = "File Form 18 to request examination within the prescribed period."
    assert filter_text(text).text == text


# -- the whole stage ----------------------------------------------------------


def test_an_issue_not_raised_by_the_facts_says_so_rather_than_vanishing() -> None:
    analysis = analyse(
        "Can we patent our new extraction process?",
        passages=[],
        jurisdiction=Jurisdiction.IN,
        corpus_document_ids=ALL_DOCUMENTS,
    )
    by_issue = {finding.issue: finding for finding in analysis.issues}
    assert set(by_issue) == set(IssueType), "every issue is reported, one way or the other"
    assert by_issue[IssueType.PATENT].status is IssueStatus.INDICATED
    assert by_issue[IssueType.TRADE_MARK].status is IssueStatus.NOT_INDICATED
    assert by_issue[IssueType.TRADE_MARK].reason_keys == ["issueNotIndicatedFromFacts"]


def test_the_nine_abstain_codes_are_all_reachable() -> None:
    from app.reasoning.engine import _BY_REASON, _BY_REFUSAL

    reachable = set(_BY_REASON.values()) | set(_BY_REFUSAL.values())
    reachable.add(AbstainCode.UNSUPPORTED_JURISDICTION)
    assert reachable == set(AbstainCode)


def test_the_fact_rules_are_cached_but_reloadable() -> None:
    assert get_fact_rules() is get_fact_rules()
