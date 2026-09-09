import type { AbstainReason, Confidence, Jurisdiction } from '@/types/domain';

/**
 * Confidence, computed from the retrieval result.
 *
 * Not from how the answer reads, not from the model's own estimate, and never
 * from the records beside it — this function is not given records at all, which
 * is the cheapest way to guarantee rule 7 holds.
 *
 * The thresholds are named constants rather than literals in a condition so the
 * rule can be stated in one place and argued with. Phase 10 ports this to the
 * backend; `evals/confidence-cases.json` is the shared case set both
 * implementations are checked against, so the port cannot quietly disagree.
 */

/** Below this a passage is not a candidate at all. */
export const RERANK_FLOOR = 0.35;
/** At or above this a passage genuinely bears on the question. */
export const RERANK_STRONG = 0.55;

export interface RetrievedPassage {
  citation_id: string;
  document_id: string;
  retrieval_score: number;
  rerank_score: number;
  /** False when the passage sits outside its effective window. */
  within_effective_window: boolean;
}

export interface RetrievalEvidence {
  jurisdiction: Jurisdiction;
  passages: RetrievedPassage[];
  /** Pairs of citation ids the pipeline found in tension. */
  contradictions: Array<[string, string]>;
  /** The question is outside what this product covers at all. */
  out_of_scope: boolean;
  /** The answer turns on a fact the reader has not given. */
  needs_more_facts: boolean;
}

export interface ConfidenceResult {
  level: Confidence;
  /** Key in the `common` namespace under `confidence.reasons`. */
  reasonKey:
    | 'high'
    | 'moderateSingleDocument'
    | 'moderateOutOfWindow'
    | 'moderateThin'
    | 'lowWeak'
    | 'lowContradiction'
    | 'abstainNothing'
    | 'abstainScope'
    | 'abstainConflict'
    | 'abstainStale'
    | 'abstainFacts';
  reasonVars: { passages: number; documents: number };
  /** Set only when the level is `abstain`. */
  abstainReason: AbstainReason | null;
}

export function scoreConfidence(evidence: RetrievalEvidence): ConfidenceResult {
  const candidates = evidence.passages.filter((p) => p.rerank_score >= RERANK_FLOOR);
  const strong = candidates.filter((p) => p.rerank_score >= RERANK_STRONG);
  // A contradiction only counts between passages that cleared the floor. Two
  // passages that disagree, neither of which bears on the question, is not a
  // disagreement about the answer — it is noise that happens to be in tension.
  const ids = new Set(candidates.map((p) => p.citation_id));
  const contradictions = evidence.contradictions.filter(([a, b]) => ids.has(a) && ids.has(b));
  const documents = new Set(candidates.map((p) => p.document_id));
  const strongDocuments = new Set(strong.map((p) => p.document_id));
  const allInWindow = candidates.every((p) => p.within_effective_window);
  const vars = { passages: candidates.length, documents: documents.size };

  // Out of scope is decided before anything is retrieved, and no quantity of
  // passages changes it.
  if (evidence.out_of_scope) {
    return {
      level: 'abstain',
      reasonKey: 'abstainScope',
      reasonVars: vars,
      abstainReason: 'out_of_scope',
    };
  }

  // Like out of scope, this is decided from the question rather than from what
  // was retrieved: the answer turns on a fact the reader has not given, and it
  // would still turn on it however much the corpus returned. So it is settled
  // before the retrieval-dependent branches.
  if (evidence.needs_more_facts) {
    return {
      level: 'abstain',
      reasonKey: 'abstainFacts',
      reasonVars: vars,
      abstainReason: 'needs_more_facts',
    };
  }

  // Nothing cleared the floor. There is nothing to answer from.
  if (candidates.length === 0) {
    return {
      level: 'abstain',
      reasonKey: 'abstainNothing',
      reasonVars: vars,
      abstainReason: 'nothing_relevant',
    };
  }

  // A contradiction between the only passages available is not a weak answer,
  // it is two answers. Showing one of them would be picking a side silently.
  if (contradictions.length > 0 && strong.length < 2) {
    return {
      level: 'abstain',
      reasonKey: 'abstainConflict',
      reasonVars: vars,
      abstainReason: 'sources_conflict',
    };
  }

  // Everything found sits outside its effective window: the position on record
  // is one this corpus knows has moved.
  if (!candidates.some((p) => p.within_effective_window)) {
    return {
      level: 'abstain',
      reasonKey: 'abstainStale',
      reasonVars: vars,
      abstainReason: 'sources_out_of_date',
    };
  }

  // A surviving contradiction caps the answer at low, whatever else is true.
  if (contradictions.length > 0) {
    return {
      level: 'low',
      reasonKey: 'lowContradiction',
      reasonVars: vars,
      abstainReason: null,
    };
  }

  if (strong.length >= 3 && strongDocuments.size >= 2 && allInWindow) {
    return { level: 'high', reasonKey: 'high', reasonVars: vars, abstainReason: null };
  }

  if (strong.length === 0) {
    // Candidates, but none of them strong: an answer resting on weak matches.
    return { level: 'low', reasonKey: 'lowWeak', reasonVars: vars, abstainReason: null };
  }

  if (!allInWindow) {
    return {
      level: 'moderate',
      reasonKey: 'moderateOutOfWindow',
      reasonVars: vars,
      abstainReason: null,
    };
  }

  if (documents.size === 1) {
    return {
      level: 'moderate',
      reasonKey: 'moderateSingleDocument',
      reasonVars: vars,
      abstainReason: null,
    };
  }

  // Strong passages from more than one document, all current, but fewer than
  // the three that `high` requires.
  return { level: 'moderate', reasonKey: 'moderateThin', reasonVars: vars, abstainReason: null };
}
