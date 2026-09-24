"""The JurisdictionConflictEngine: what does not sit together, and why.

Every conflict here is found in metadata — jurisdiction, authority level,
supersession, effective dates, which rules fired, which facts are unknown. None
is found by reading two passages and deciding they disagree. That restraint is
the whole design: a conflict detected from wording would be a guess, and telling
someone the law is unsettled when it is not is a worse failure than staying
quiet. The input pairs come from ingestion, which records an express override or
a superseding instrument at the time the document is read, not at query time.

The seven rules, in the order they are tried. The first that matches decides,
because they are ordered from the most specific explanation of a disagreement to
the least:

1. different jurisdictions            -> jurisdictional  -> separate obligations
2. one supersedes the other / dates   -> temporal        -> resolved by date
3. different authority levels         -> authority       -> resolved by authority
4. different issues                   -> scope overlap   -> separate obligations
5. same level, jurisdiction and date  -> true conflict   -> unresolved, escalate

and two that come from the reasoning rather than from a pair of passages:

6. two classification rules satisfied -> classification  -> unresolved
7. a decisive fact unknown            -> missing fact    -> human review

Note what rule 1 does *not* do. India and International are separate namespaces
and are never retrieved into one set, so a jurisdictional conflict is raised
from the fact that the question reached both, not by comparing their passages.
Nothing in this module ever puts two jurisdictions' evidence side by side.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.models.domain import (
    Conflict,
    ConflictType,
    IssueType,
    Jurisdiction,
    ResolutionStatus,
)
from app.registry.store import SourceRegistry
from app.retrieval.types import ScoredChunk

#: Which issue a passage speaks to, from the metadata ingestion gave it.
_ISSUE_BY_AREA = {
    "abs_compliance": IssueType.BIODIVERSITY_ABS,
    "food_nutraceutical": IssueType.FOOD_REGULATION,
}
_ISSUE_BY_RIGHT = {
    "patent": IssueType.PATENT,
    "trademark": IssueType.TRADE_MARK,
    "design": IssueType.DESIGN,
    "geographical_indication": IssueType.GEOGRAPHICAL_INDICATION,
    "copyright": IssueType.COPYRIGHT,
    "trade_secret": IssueType.TRADE_SECRET,
    "traditional_knowledge": IssueType.TRADITIONAL_KNOWLEDGE,
}


@dataclass(frozen=True)
class _Side:
    """One half of a pair, with everything the rules need to compare."""

    citation_id: str
    document_id: str
    jurisdiction: Jurisdiction
    authority_level: int | None
    effective_from: date | None
    superseded_by: str | None
    issue: IssueType | None


def issue_of(chunk: ScoredChunk) -> IssueType | None:
    """The issue a passage speaks to, or None when its metadata does not say."""
    for area in chunk.chunk.regulatory_areas:
        if area.value in _ISSUE_BY_AREA:
            return _ISSUE_BY_AREA[area.value]
    for right in chunk.chunk.ip_rights:
        if right.value in _ISSUE_BY_RIGHT:
            return _ISSUE_BY_RIGHT[right.value]
    if chunk.chunk.regulatory_areas:
        return IssueType.DRUG_REGULATION
    return None


def _side(chunk: ScoredChunk, registry: SourceRegistry | None) -> _Side:
    record = registry.get(chunk.chunk.document_id) if registry is not None else None
    return _Side(
        citation_id=chunk.chunk.chunk_id,
        document_id=chunk.chunk.document_id,
        jurisdiction=chunk.chunk.jurisdiction,
        authority_level=record.authority_level if record else None,
        effective_from=chunk.chunk.effective_from,
        superseded_by=chunk.chunk.superseded_by,
        issue=issue_of(chunk),
    )


def _classify_pair(a: _Side, b: _Side) -> Conflict:
    conflict_id = f"cf-{a.citation_id}-{b.citation_id}"
    common = {
        "conflict_id": conflict_id,
        "source_a": a.citation_id,
        "source_b": b.citation_id,
        "issue": a.issue or b.issue,
    }

    if a.jurisdiction is not b.jurisdiction:
        return Conflict(
            **common,
            conflict_type=ConflictType.JURISDICTIONAL,
            explanation_key="conflictJurisdictional",
            resolution_status=ResolutionStatus.SEPARATE_OBLIGATIONS,
            reasoning_basis="jurisdiction",
        )

    # Supersession is recorded by ingestion from the instrument itself, so it
    # settles the pair outright.
    if b.superseded_by == a.document_id or a.superseded_by == b.document_id:
        governing = a.citation_id if b.superseded_by == a.document_id else b.citation_id
        return Conflict(
            **common,
            conflict_type=ConflictType.TEMPORAL,
            governing_source=governing,
            explanation_key="conflictTemporalSuperseded",
            resolution_status=ResolutionStatus.RESOLVED_BY_DATE,
            reasoning_basis="superseded_by",
        )

    if a.effective_from and b.effective_from and a.effective_from != b.effective_from:
        later = a if a.effective_from > b.effective_from else b
        return Conflict(
            **common,
            conflict_type=ConflictType.TEMPORAL,
            governing_source=later.citation_id,
            explanation_key="conflictTemporalLater",
            resolution_status=ResolutionStatus.RESOLVED_BY_DATE,
            reasoning_basis="effective_from",
        )

    levels_known = a.authority_level is not None and b.authority_level is not None
    if levels_known and a.authority_level != b.authority_level:
        higher = a if a.authority_level < b.authority_level else b
        return Conflict(
            **common,
            conflict_type=ConflictType.AUTHORITY,
            governing_source=higher.citation_id,
            explanation_key="conflictAuthority",
            resolution_status=ResolutionStatus.RESOLVED_BY_AUTHORITY,
            reasoning_basis="authority_level",
        )

    if a.issue is not None and b.issue is not None and a.issue is not b.issue:
        return Conflict(
            **common,
            conflict_type=ConflictType.SCOPE_OVERLAP,
            explanation_key="conflictScopeOverlap",
            resolution_status=ResolutionStatus.SEPARATE_OBLIGATIONS,
            reasoning_basis="different_issues",
        )

    # Everything that could have explained the disagreement has been tried.
    # Two instruments of the same standing, in the same system, in force at the
    # same time, recorded as overriding each other: nothing here can settle it.
    return Conflict(
        **common,
        conflict_type=ConflictType.TRUE_SOURCE_CONFLICT,
        explanation_key="conflictTrueSource",
        resolution_status=ResolutionStatus.UNRESOLVED,
        reasoning_basis="same_authority_same_date",
        requires_human_review=True,
    )


def from_pairs(
    pairs: tuple[tuple[str, str], ...],
    passages: list[ScoredChunk],
    registry: SourceRegistry | None = None,
) -> list[Conflict]:
    """Turn the contradictions ingestion recorded into typed Conflict objects."""
    by_id = {chunk.chunk.chunk_id: chunk for chunk in passages}
    conflicts: list[Conflict] = []
    seen: set[frozenset[str]] = set()
    for left, right in pairs:
        if left not in by_id or right not in by_id:
            continue
        key = frozenset({left, right})
        if key in seen:
            continue
        seen.add(key)
        left_side = _side(by_id[left], registry)
        right_side = _side(by_id[right], registry)
        conflicts.append(_classify_pair(left_side, right_side))
    return conflicts


def jurisdictional(
    issue: IssueType | None,
    other: Jurisdiction,
    *,
    here: str | None = None,
    there: str | None = None,
) -> Conflict:
    """The question reached a second legal system; both sets of duties stand.

    Raised from routing rather than from a pair of passages. Where the governing
    document on each side is known, both are named, so a reader can compare them
    — that is the whole use of saying this at all. Naming the other side's
    document is not merging the two answers: its text never enters this
    jurisdiction's context, and the two answers stay separate.
    """
    return Conflict(
        conflict_id=f"cf-jurisdiction-{other.value.lower()}",
        conflict_type=ConflictType.JURISDICTIONAL,
        issue=issue,
        source_a=here or "this_jurisdiction",
        source_b=there or other.value,
        explanation_key="conflictJurisdictional",
        resolution_status=ResolutionStatus.SEPARATE_OBLIGATIONS,
        reasoning_basis="jurisdiction",
    )


def classification(alternatives_present: bool, rule_id: str | None) -> Conflict | None:
    """Two classification rules were satisfied at once."""
    if not alternatives_present:
        return None
    return Conflict(
        conflict_id="cf-classification",
        conflict_type=ConflictType.CLASSIFICATION,
        source_a=rule_id or "classification_rules",
        source_b="classification_rules",
        explanation_key="conflictClassification",
        resolution_status=ResolutionStatus.UNRESOLVED,
        reasoning_basis="two_rules_satisfied",
        requires_human_review=False,
    )


def missing_fact(keys: list[str], decisive: bool) -> Conflict | None:
    """A fact nobody has stated is what separates two readings of the situation.

    `decisive` marks the case where supplying the fact still would not settle it
    without someone applying a provision to it — that needs a person, and says so.
    """
    if not keys:
        return None
    return Conflict(
        conflict_id="cf-missing-fact",
        conflict_type=ConflictType.MISSING_FACT,
        source_a=keys[0],
        source_b="stated_facts",
        explanation_key="conflictMissingFact",
        resolution_status=ResolutionStatus.UNRESOLVED,
        reasoning_basis="material_fact_unknown",
        requires_human_review=decisive,
    )
