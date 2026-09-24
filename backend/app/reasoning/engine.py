"""The reasoning stage: the order the parts run in, and what they are given.

This runs after retrieval and before the answer is composed. It never changes
the answer text — the prose is still only retrieved passages, rearranged. What
it produces is the reasoning beside the answer: what facts the reader stated,
what category the rules reached, which issues arose, what could not be settled,
how sure the product is issue by issue, and who to ask.

The order matters and is not arbitrary. Facts come first because the rules read
them; classification next because issues depend on the category; conflicts after
issues because a conflict is attached to an issue; confidence after conflicts
because an unresolved conflict caps it; escalation last because it is the
highest thing anything else reached.
"""

from __future__ import annotations

from app.models.domain import (
    AbstainCode,
    AbstainReason,
    Analysis,
    Conflict,
    IPRight,
    IssueFinding,
    IssueStatus,
    Jurisdiction,
    ProductClass,
    RegulatoryArea,
)
from app.reasoning import applicability, classify, conflicts, escalation, issues
from app.reasoning.confidence import IssueConfidence, IssueSignals, score_issue
from app.reasoning.facts import ExtractedFacts, extract_facts
from app.reasoning.rules import get_confidence_rules, get_fact_rules, load_classification_rules
from app.registry.store import SourceRegistry
from app.retrieval.types import ScoredChunk
from app.services.guardrails import Refusal, RefusalKind

#: The old coarse reasons, mapped onto the nine codes. Both surfaces have to
#: agree, and the older rule is pinned by the TypeScript mirror, so the mapping
#: lives here rather than changing it.
_BY_REASON: dict[AbstainReason, AbstainCode] = {
    AbstainReason.NOTHING_RELEVANT: AbstainCode.INSUFFICIENT_AUTHORITATIVE_EVIDENCE,
    AbstainReason.OUT_OF_SCOPE: AbstainCode.OUT_OF_SCOPE_NON_IP,
    AbstainReason.SOURCES_CONFLICT: AbstainCode.CONFLICTING_AUTHORITATIVE_SOURCES,
    AbstainReason.SOURCES_OUT_OF_DATE: AbstainCode.SOURCE_STATUS_UNCERTAIN,
    AbstainReason.NEEDS_MORE_FACTS: AbstainCode.MISSING_MATERIAL_FACTS,
}

_BY_REFUSAL: dict[RefusalKind, AbstainCode] = {
    RefusalKind.CLINICAL: AbstainCode.OUT_OF_SCOPE_CLINICAL_QUERY,
    RefusalKind.OUTCOME_PREDICTION: AbstainCode.REQUEST_FOR_LEGAL_VERDICT,
    RefusalKind.NOVELTY_VERDICT: AbstainCode.REQUEST_FOR_LEGAL_VERDICT,
    RefusalKind.INDIVIDUAL_LEGAL_OPINION: AbstainCode.PROFESSIONAL_INTERPRETATION_REQUIRED,
    RefusalKind.RECOMMENDATION: AbstainCode.PROFESSIONAL_INTERPRETATION_REQUIRED,
    RefusalKind.DRAFTING: AbstainCode.PROFESSIONAL_INTERPRETATION_REQUIRED,
    RefusalKind.CONCEALMENT: AbstainCode.OUT_OF_SCOPE_NON_IP,
}


def abstain_code_for(
    reason: AbstainReason | None = None,
    refusal: Refusal | None = None,
    *,
    unsupported_jurisdiction: bool = False,
) -> AbstainCode | None:
    """One code for why the product declined, from whichever half decided it."""
    if refusal is not None:
        return _BY_REFUSAL.get(refusal.kind, AbstainCode.PROFESSIONAL_INTERPRETATION_REQUIRED)
    if unsupported_jurisdiction:
        return AbstainCode.UNSUPPORTED_JURISDICTION
    if reason is not None:
        return _BY_REASON.get(reason)
    return None


def _backed_document_ids(
    registry: SourceRegistry | None, corpus_document_ids: frozenset[str]
) -> frozenset[str]:
    """Documents a rule may rest on: in the corpus, and citable.

    `corpus_document_ids` is every document the store holds, not the ones this
    query happened to retrieve — a document that was not retrieved for one
    question has not left the corpus, and reading it that way would switch the
    rules off at random.

    With no registry built, the corpus alone decides, so a fresh clone still
    classifies instead of silently refusing to.
    """
    if registry is None:
        return corpus_document_ids
    usable = set(registry.usable_ids())
    if not usable:
        return corpus_document_ids
    return frozenset(corpus_document_ids & usable)


def analyse(
    question: str,
    *,
    passages: list[ScoredChunk],
    jurisdiction: Jurisdiction,
    ip_rights: tuple[IPRight, ...] = (),
    regulatory_areas: tuple[RegulatoryArea, ...] = (),
    contradiction_pairs: tuple[tuple[str, str], ...] = (),
    corpus_document_ids: frozenset[str] = frozenset(),
    registry: SourceRegistry | None = None,
    dropped_claims: int = 0,
    provenance_pending: bool = False,
    other_jurisdictions: tuple[Jurisdiction, ...] = (),
    #: The document that governs here, and the one that governs there, so a
    #: cross-border conflict can name both sides instead of two jurisdictions.
    governing_here: str | None = None,
    governing_there: str | None = None,
    unsupported_jurisdictions: tuple[str, ...] = (),
    abstain_reason: AbstainReason | None = None,
    refusal: Refusal | None = None,
    known_facts: ExtractedFacts | None = None,
) -> Analysis:
    # A caller that already holds structured facts — Check My Product, where
    # the person answered field by field — hands them over. Re-reading them out
    # of a sentence would be strictly worse: phrase matching can only lose
    # information a form already captured exactly.
    facts = known_facts if known_facts is not None else extract_facts(question, get_fact_rules())

    rules, material = load_classification_rules(_backed_document_ids(registry, corpus_document_ids))
    classification = classify.classify(facts, rules, material)

    findings = issues.classify_issues(
        facts,
        ip_rights=ip_rights,
        regulatory_areas=regulatory_areas,
        product_class=classification.product_class,
    )
    raised = issues.indicated(findings)

    found: list[Conflict] = conflicts.from_pairs(contradiction_pairs, passages, registry)
    for other in other_jurisdictions:
        if other is not jurisdiction:
            found.append(
                conflicts.jurisdictional(
                    raised[0].issue if raised else None,
                    other,
                    here=governing_here,
                    there=governing_there,
                )
            )
    # Classification is only in play when the reader described a product. "How
    # do I request examination?" states nothing about any product, so reporting
    # five open categories and a decisive missing fact would be noise — and it
    # would push a plain procedural question to "expert review needed", which is
    # how an escalation level stops meaning anything.
    described_a_product = bool(facts.stated)
    if described_a_product:
        classification_conflict = conflicts.classification(
            classification.ambiguous, classification.rule_id
        )
        if classification_conflict is not None:
            found.append(classification_conflict)
        missing_conflict = conflicts.missing_fact(
            [fact.key for fact in classification.missing_facts],
            decisive=classification.product_class is ProductClass.UNDETERMINED and bool(raised),
        )
        if missing_conflict is not None:
            found.append(missing_conflict)

    scored = _score_issues(
        raised,
        passages=passages,
        conflicts_found=found,
        registry=registry,
        # The same condition the report uses. Stepping confidence down for
        # facts the answer does not list as missing would leave the reader with
        # a lowered confidence and no way to see what caused it.
        missing_material_facts=described_a_product and bool(classification.missing_facts),
        dropped_claims=dropped_claims,
        provenance_pending=provenance_pending,
        partial_jurisdiction=bool(unsupported_jurisdictions),
        refusal=refusal,
    )
    by_issue = {item.issue: item for item in scored}
    findings = [
        finding.model_copy(
            update={
                "confidence": by_issue[finding.issue].level,
                "confidence_reason_keys": list(by_issue[finding.issue].reason_keys),
                "missing_facts": list(classification.missing_facts),
            }
        )
        if finding.issue in by_issue and finding.status is IssueStatus.INDICATED
        else finding
        for finding in findings
    ]

    code = abstain_code_for(
        abstain_reason,
        refusal,
        unsupported_jurisdiction=bool(unsupported_jurisdictions) and not passages,
    )

    return Analysis(
        facts=list(facts.stated),
        missing_facts=list(classification.missing_facts) if described_a_product else [],
        product_class=classification.product_class,
        # Where a rule fired, the alternatives are the other rules that also
        # fired. Where none did, they are the categories still open.
        alternative_classes=list(classification.alternatives or classification.candidates),
        classification_rule_id=classification.rule_id,
        changes_if=classification.changes_if,
        issues=findings,
        conflicts=found,
        applicability=applicability.assess(passages, facts, classification.product_class),
        escalation=escalation.decide(
            scored,
            found,
            abstain_code=code,
            missing_facts=described_a_product and bool(classification.missing_facts),
        ),
        abstain_code=code,
        unsupported_jurisdictions=list(unsupported_jurisdictions),
    )


def _score_issues(
    raised: list[IssueFinding],
    *,
    passages: list[ScoredChunk],
    conflicts_found: list[Conflict],
    registry: SourceRegistry | None,
    missing_material_facts: bool,
    dropped_claims: int,
    provenance_pending: bool,
    partial_jurisdiction: bool,
    refusal: Refusal | None,
) -> list[IssueConfidence]:
    rules = get_confidence_rules()
    unresolved = {
        conflict.issue
        for conflict in conflicts_found
        if conflict.issue is not None and conflict.requires_human_review
    }
    by_issue: dict = {}
    for passage in passages:
        issue = conflicts.issue_of(passage)
        if issue is not None:
            by_issue.setdefault(issue, []).append(passage)

    scored: list[IssueConfidence] = []
    for finding in raised:
        mine = by_issue.get(finding.issue, [])
        levels = [
            record.authority_level
            for passage in mine
            if registry is not None and (record := registry.get(passage.chunk.document_id))
            if record.authority_level is not None
        ]
        scored.append(
            score_issue(
                IssueSignals(
                    issue=finding.issue,
                    # With no registry the corpus cannot be ranked, so this is
                    # left true rather than stepping every issue down for a
                    # reason that is about the machine, not the sources.
                    has_primary_authority=(
                        any(level <= 2 for level in levels) if levels else registry is None
                    ),
                    citation_removed=dropped_claims > 0,
                    missing_material_facts=missing_material_facts,
                    source_status_uncertain=provenance_pending,
                    requires_professional_interpretation=refusal is not None,
                    partial_jurisdiction_coverage=partial_jurisdiction,
                    unresolved_conflict=finding.issue in unresolved,
                    no_usable_source=not mine and not passages,
                ),
                rules,
            )
        )
    return scored
