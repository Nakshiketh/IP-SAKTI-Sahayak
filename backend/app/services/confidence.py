"""Confidence, computed from the retrieval result.

The Python half of a rule that also exists in TypeScript at
`frontend/src/services/confidence.ts`. Both are checked against
`evals/confidence-cases.json`, so a rule the two implementations disagree about
is a rule the tests reject rather than a rule nobody can state.

Two implementations of one rule is a cost, and it is paid on purpose. The
frontend needs the rule to run over the demo service with no backend present;
the backend needs it to run over real retrieval. Sharing it would mean shipping
a runtime across the boundary. Sharing the *cases* costs nothing and catches the
drift that actually matters.

What the rule reads: rerank scores, the documents those passages came from,
whether they are in force, and three flags the pipeline sets. What it never
reads: how the answer is worded, the model's own estimate of itself, and the
records beside the answer — this function is not given records at all, which is
the cheapest way to guarantee rule 7 holds.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from app.models.domain import AbstainReason, Confidence, Jurisdiction

#: Below this a passage is not a candidate at all.
RERANK_FLOOR = 0.35
#: At or above this a passage genuinely bears on the question.
RERANK_STRONG = 0.55


class ReasonKey(StrEnum):
    """The key the interface renders under `confidence.reasons`.

    A key rather than a sentence: the reason is shown in the reader's language,
    and a rule that returned English prose could not be.
    """

    HIGH = "high"
    MODERATE_SINGLE_DOCUMENT = "moderateSingleDocument"
    MODERATE_OUT_OF_WINDOW = "moderateOutOfWindow"
    MODERATE_THIN = "moderateThin"
    MODERATE_PROVENANCE_PENDING = "moderateProvenancePending"
    LOW_WEAK = "lowWeak"
    LOW_CONTRADICTION = "lowContradiction"
    ABSTAIN_NOTHING = "abstainNothing"
    ABSTAIN_SCOPE = "abstainScope"
    ABSTAIN_CONFLICT = "abstainConflict"
    ABSTAIN_STALE = "abstainStale"
    ABSTAIN_FACTS = "abstainFacts"


@dataclass(frozen=True)
class RetrievedPassage:
    citation_id: str
    document_id: str
    retrieval_score: float
    rerank_score: float
    #: False when the passage sits outside its effective window.
    within_effective_window: bool


@dataclass(frozen=True)
class RetrievalEvidence:
    jurisdiction: Jurisdiction
    passages: tuple[RetrievedPassage, ...] = ()
    #: Pairs of citation ids the pipeline found in tension.
    contradictions: tuple[tuple[str, str], ...] = ()
    #: The question is outside what this product covers at all.
    out_of_scope: bool = False
    #: The answer turns on a fact the reader has not given.
    needs_more_facts: bool = False


@dataclass(frozen=True)
class ConfidenceResult:
    level: Confidence
    reason_key: ReasonKey
    reason_vars: dict[str, int] = field(default_factory=dict)
    #: Set only when the level is `abstain`.
    abstain_reason: AbstainReason | None = None


def score_confidence(evidence: RetrievalEvidence) -> ConfidenceResult:
    candidates = [p for p in evidence.passages if p.rerank_score >= RERANK_FLOOR]
    strong = [p for p in candidates if p.rerank_score >= RERANK_STRONG]
    # A contradiction only counts between passages that cleared the floor. Two
    # passages that disagree, neither of which bears on the question, is not a
    # disagreement about the answer — it is noise that happens to be in tension.
    ids = {p.citation_id for p in candidates}
    contradictions = [pair for pair in evidence.contradictions if pair[0] in ids and pair[1] in ids]
    documents = {p.document_id for p in candidates}
    strong_documents = {p.document_id for p in strong}
    all_in_window = all(p.within_effective_window for p in candidates)
    variables = {"passages": len(candidates), "documents": len(documents)}

    # Out of scope is decided before anything is retrieved, and no quantity of
    # passages changes it.
    if evidence.out_of_scope:
        return ConfidenceResult(
            Confidence.ABSTAIN, ReasonKey.ABSTAIN_SCOPE, variables, AbstainReason.OUT_OF_SCOPE
        )

    # Like out of scope, this is decided from the question rather than from what
    # was retrieved: the answer turns on a fact the reader has not given, and it
    # would still turn on it however much the corpus returned. So it is settled
    # before the retrieval-dependent branches. Ordering it after them told a
    # reader "I could not find anything" when the useful and true thing to say
    # was "this turns on something only you can tell me".
    if evidence.needs_more_facts:
        return ConfidenceResult(
            Confidence.ABSTAIN, ReasonKey.ABSTAIN_FACTS, variables, AbstainReason.NEEDS_MORE_FACTS
        )

    # Nothing cleared the floor. There is nothing to answer from.
    if not candidates:
        return ConfidenceResult(
            Confidence.ABSTAIN, ReasonKey.ABSTAIN_NOTHING, variables, AbstainReason.NOTHING_RELEVANT
        )

    # A contradiction between the only passages available is not a weak answer,
    # it is two answers. Showing one of them would be picking a side silently.
    if contradictions and len(strong) < 2:
        return ConfidenceResult(
            Confidence.ABSTAIN,
            ReasonKey.ABSTAIN_CONFLICT,
            variables,
            AbstainReason.SOURCES_CONFLICT,
        )

    # Everything found sits outside its effective window: the position on record
    # is one this corpus knows has moved.
    if not any(p.within_effective_window for p in candidates):
        return ConfidenceResult(
            Confidence.ABSTAIN,
            ReasonKey.ABSTAIN_STALE,
            variables,
            AbstainReason.SOURCES_OUT_OF_DATE,
        )

    # A surviving contradiction caps the answer at low, whatever else is true.
    if contradictions:
        return ConfidenceResult(Confidence.LOW, ReasonKey.LOW_CONTRADICTION, variables, None)

    if len(strong) >= 3 and len(strong_documents) >= 2 and all_in_window:
        return ConfidenceResult(Confidence.HIGH, ReasonKey.HIGH, variables, None)

    if not strong:
        # Candidates, but none of them strong: an answer resting on weak matches.
        return ConfidenceResult(Confidence.LOW, ReasonKey.LOW_WEAK, variables, None)

    if not all_in_window:
        return ConfidenceResult(Confidence.MODERATE, ReasonKey.MODERATE_OUT_OF_WINDOW, variables)

    if len(documents) == 1:
        return ConfidenceResult(
            Confidence.MODERATE, ReasonKey.MODERATE_SINGLE_DOCUMENT, variables, None
        )

    # Strong passages from more than one document, all current, but fewer than
    # the three that `high` requires.
    return ConfidenceResult(Confidence.MODERATE, ReasonKey.MODERATE_THIN, variables, None)
