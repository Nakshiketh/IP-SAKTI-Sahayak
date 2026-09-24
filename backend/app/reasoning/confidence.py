"""Confidence per issue, from `data/rules/confidence.yaml`.

Separate from `app/services/confidence.py`, which decides whether the product
answers at all and is mirrored in TypeScript. This one runs afterwards, over an
answer that is already being given, and says how sure it is issue by issue.

One number for a whole answer hides the case this product exists to handle: a
question about an Ayurvedic formulation touches patents, traditional knowledge
and biodiversity at once, and the sources are rarely equally good on all three.
Reporting "moderate" over the lot would be true of none of them.

Each issue starts HIGH and steps down one level per factor that fired. Counted,
never weighted — a weight would be a number nobody could defend. Caps hold a
level down and never raise it, so a cap can only ever make the product less sure
of itself.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.domain import Confidence, IssueType
from app.reasoning.rules import ConfidenceRules, get_confidence_rules

_ORDER = (Confidence.HIGH, Confidence.MODERATE, Confidence.LOW)


@dataclass(frozen=True)
class IssueSignals:
    """What the rules read. Every field is a fact about the evidence, not a score."""

    issue: IssueType
    #: Passages for this issue that came from a level 1 or 2 source.
    has_primary_authority: bool = False
    #: A claim was dropped because no retrieved passage supported it.
    citation_removed: bool = False
    missing_material_facts: bool = False
    #: A cited source is review-due, or cited on provenance still pending.
    source_status_uncertain: bool = False
    requires_professional_interpretation: bool = False
    partial_jurisdiction_coverage: bool = False
    unresolved_conflict: bool = False
    #: No usable source at all. Not a low confidence; no confidence.
    no_usable_source: bool = False


@dataclass(frozen=True)
class IssueConfidence:
    issue: IssueType
    level: Confidence | None
    reason_keys: tuple[str, ...]


def _step(level: Confidence, steps: int) -> Confidence:
    index = min(_ORDER.index(level) + steps, len(_ORDER) - 1)
    return _ORDER[index]


def _cap(level: Confidence, ceiling: Confidence) -> Confidence:
    return level if _ORDER.index(level) >= _ORDER.index(ceiling) else ceiling


def score_issue(signals: IssueSignals, rules: ConfidenceRules | None = None) -> IssueConfidence:
    rules = rules or get_confidence_rules()

    if signals.no_usable_source:
        # Abstention for this issue. The code, not a level, is what the
        # interface renders — there is nothing to be confident about.
        return IssueConfidence(signals.issue, None, ("issueNoUsableSource",))

    fired: dict[str, str] = {rule_id: reason for rule_id, reason in rules.step_down}
    reasons: list[str] = []
    steps = 0
    for rule_id, matched in (
        ("no_primary_authority", not signals.has_primary_authority),
        ("citation_removed", signals.citation_removed),
        ("missing_material_facts", signals.missing_material_facts),
        ("source_status_uncertain", signals.source_status_uncertain),
    ):
        if matched and rule_id in fired:
            steps += 1
            reasons.append(fired[rule_id])

    level = _step(Confidence.HIGH, steps)

    ceilings = {rule_id: (at, reason) for rule_id, at, reason in rules.caps}
    for rule_id, matched in (
        ("professional_interpretation", signals.requires_professional_interpretation),
        ("partial_jurisdiction_coverage", signals.partial_jurisdiction_coverage),
        ("unresolved_conflict", signals.unresolved_conflict),
    ):
        if not matched or rule_id not in ceilings:
            continue
        at, reason = ceilings[rule_id]
        capped = _cap(level, Confidence(at))
        if capped is not level:
            level = capped
            reasons.append(reason)
        elif reason not in reasons:
            reasons.append(reason)

    if not reasons:
        reasons.append("issueWellSupported")
    return IssueConfidence(signals.issue, level, tuple(reasons))


def specialists_for(issue: IssueType, rules: ConfidenceRules | None = None) -> tuple[str, ...]:
    rules = rules or get_confidence_rules()
    return rules.specialists.get(issue.value, ())
