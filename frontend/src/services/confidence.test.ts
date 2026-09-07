/**
 * The confidence rule, checked against the shared case set.
 *
 * `evals/confidence-cases.json` is deliberately outside the frontend: Phase 10
 * ports this function to Python and must be checked against the same file, so
 * the two implementations cannot quietly disagree about what "moderate" means.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RERANK_FLOOR,
  RERANK_STRONG,
  scoreConfidence,
  type RetrievalEvidence,
  type RetrievedPassage,
} from '@/services/confidence';

interface Case {
  name: string;
  passages: RetrievedPassage[];
  contradictions: Array<[string, string]>;
  out_of_scope: boolean;
  needs_more_facts: boolean;
  expect: { level: string; reasonKey: string; abstainReason: string | null };
}

const suite = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'evals', 'confidence-cases.json'), 'utf-8'),
) as { thresholds: { rerank_floor: number; rerank_strong: number }; cases: Case[] };

function evidenceFor(testCase: Case): RetrievalEvidence {
  return {
    jurisdiction: 'IN',
    passages: testCase.passages,
    contradictions: testCase.contradictions,
    out_of_scope: testCase.out_of_scope,
    needs_more_facts: testCase.needs_more_facts,
  };
}

describe('the confidence rule', () => {
  it('uses the thresholds the shared case set was written against', () => {
    expect(RERANK_FLOOR).toBe(suite.thresholds.rerank_floor);
    expect(RERANK_STRONG).toBe(suite.thresholds.rerank_strong);
  });

  it('covers every level, so no branch is untested', () => {
    const levels = new Set(suite.cases.map((c) => c.expect.level));
    expect([...levels].sort()).toEqual(['abstain', 'high', 'low', 'moderate']);
  });

  it.each(suite.cases.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    const result = scoreConfidence(evidenceFor(testCase));
    expect(result.level).toBe(testCase.expect.level);
    expect(result.reasonKey).toBe(testCase.expect.reasonKey);
    expect(result.abstainReason).toBe(testCase.expect.abstainReason);
  });

  it('reaches all four abstention reasons', () => {
    const reasons = new Set(
      suite.cases.map((c) => c.expect.abstainReason).filter((r): r is string => r !== null),
    );
    expect([...reasons].sort()).toEqual([
      'needs_more_facts',
      'nothing_relevant',
      'out_of_scope',
      'sources_conflict',
      'sources_out_of_date',
    ]);
  });
});

describe('what confidence is not allowed to depend on', () => {
  const base: RetrievalEvidence = {
    jurisdiction: 'IN',
    passages: [
      {
        citation_id: 'a',
        document_id: 'd1',
        retrieval_score: 0.8,
        rerank_score: 0.81,
        within_effective_window: true,
      },
      {
        citation_id: 'b',
        document_id: 'd2',
        retrieval_score: 0.8,
        rerank_score: 0.79,
        within_effective_window: true,
      },
      {
        citation_id: 'c',
        document_id: 'd3',
        retrieval_score: 0.7,
        rerank_score: 0.68,
        within_effective_window: true,
      },
    ],
    contradictions: [],
    out_of_scope: false,
    needs_more_facts: false,
  };

  it('takes no records at all, so records cannot raise or lower it', () => {
    // Rule 7 enforced by the signature rather than by discipline: there is no
    // parameter through which a filed or granted record could reach this.
    expect(scoreConfidence(base).level).toBe('high');
    expect(Object.keys(base)).not.toContain('records');
    expect(Object.keys(base)).not.toContain('related_records');
  });

  it('ignores retrieval score once rerank has spoken', () => {
    const rescored = {
      ...base,
      passages: base.passages.map((p) => ({ ...p, retrieval_score: 0.01 })),
    };
    expect(scoreConfidence(rescored).level).toBe(scoreConfidence(base).level);
  });

  it('is unaffected by the order passages arrive in', () => {
    const reversed = { ...base, passages: [...base.passages].reverse() };
    expect(scoreConfidence(reversed)).toEqual(scoreConfidence(base));
  });

  it('drops to abstain when the same passages fall below the floor', () => {
    const weak = {
      ...base,
      passages: base.passages.map((p) => ({ ...p, rerank_score: 0.1 })),
    };
    const result = scoreConfidence(weak);
    expect(result.level).toBe('abstain');
    expect(result.abstainReason).toBe('nothing_relevant');
  });
});
