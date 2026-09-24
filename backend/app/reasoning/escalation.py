"""How much human help this answer needs, and what kind.

The level is the highest any single issue reaches — not an average. An answer
that is solid on four issues and unresolved on the fifth is an answer someone
needs help with, and averaging would bury exactly the issue that matters.

L0  nothing here needs a person.
L1  facts are missing; the reader can supply them and get further on their own.
L2  something is genuinely uncertain: an issue came out low, or a conflict needs
    a person to look at it.
L3  a professional now: an unresolved true conflict between sources, a request
    for a verdict this product must not give, or an issue that cannot be
    answered without applying a provision to facts.
"""

from __future__ import annotations

from app.models.domain import (
    AbstainCode,
    Confidence,
    Conflict,
    ConflictType,
    Escalation,
    EscalationLevel,
    IssueType,
    ResolutionStatus,
)
from app.reasoning.confidence import IssueConfidence, specialists_for

_RANK = {
    EscalationLevel.L0: 0,
    EscalationLevel.L1: 1,
    EscalationLevel.L2: 2,
    EscalationLevel.L3: 3,
}

#: An abstention that is really a referral, not a gap in the corpus.
_L3_CODES = frozenset(
    {
        AbstainCode.REQUEST_FOR_LEGAL_VERDICT,
        AbstainCode.PROFESSIONAL_INTERPRETATION_REQUIRED,
    }
)


def decide(
    issues: list[IssueConfidence],
    conflicts: list[Conflict],
    *,
    abstain_code: AbstainCode | None = None,
    missing_facts: bool = False,
) -> Escalation:
    level = EscalationLevel.L0
    reasons: list[str] = []
    concerned: list[IssueType] = []

    def raise_to(target: EscalationLevel, reason: str) -> None:
        nonlocal level
        if _RANK[target] > _RANK[level]:
            level = target
        if reason not in reasons:
            reasons.append(reason)

    if missing_facts:
        raise_to(EscalationLevel.L1, "escalationMissingFacts")

    for issue in issues:
        if issue.level is Confidence.LOW:
            raise_to(EscalationLevel.L2, "escalationLowConfidenceIssue")
            concerned.append(issue.issue)
        if issue.level is None:
            raise_to(EscalationLevel.L2, "escalationNoUsableSource")
            concerned.append(issue.issue)

    for conflict in conflicts:
        if conflict.conflict_type is ConflictType.TRUE_SOURCE_CONFLICT:
            raise_to(EscalationLevel.L3, "escalationTrueSourceConflict")
        elif conflict.requires_human_review:
            # Settling this needs someone to apply a provision to facts, which
            # is the definition of professional interpretation, not a caution.
            raise_to(EscalationLevel.L3, "escalationProfessionalRequired")
        elif conflict.resolution_status is ResolutionStatus.UNRESOLVED:
            raise_to(EscalationLevel.L2, "escalationUnresolvedConflict")
        if conflict.issue is not None and conflict.resolution_status is (
            ResolutionStatus.UNRESOLVED
        ):
            concerned.append(conflict.issue)

    if abstain_code in _L3_CODES:
        raise_to(EscalationLevel.L3, "escalationProfessionalRequired")
    elif abstain_code is AbstainCode.CONFLICTING_AUTHORITATIVE_SOURCES:
        raise_to(EscalationLevel.L3, "escalationTrueSourceConflict")

    # Who to ask. Where nothing in particular is troubled, offer the specialists
    # for the issues that were actually in play rather than a generic list.
    wanted = concerned or [issue.issue for issue in issues]
    specialists: list[str] = []
    for issue in dict.fromkeys(wanted):
        for specialist in specialists_for(issue):
            if specialist not in specialists:
                specialists.append(specialist)

    return Escalation(
        level=level,
        reason_keys=reasons or ["escalationNoneNeeded"],
        specialists=specialists if level is not EscalationLevel.L0 else [],
    )
