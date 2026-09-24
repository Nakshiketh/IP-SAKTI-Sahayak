/**
 * Phase 5: can a first-time reader understand this?
 *
 * The promises worth holding: the short form never says anything the answer did
 * not, the detail level is remembered, the glossary never passes an explainer
 * off as authority, and the pages a reader actually lands on have no serious
 * accessibility violations.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { CaseBrief } from '@/components/answer/CaseBrief';
import { DetailToggle } from '@/components/answer/DetailToggle';
import { GuidanceEnds } from '@/components/answer/GuidanceEnds';
import { InShort } from '@/components/answer/InShort';
import { summarise, WORD_LIMIT } from '@/lib/inShort';
import type { Analysis, Answer, AnswerBlock, Claim } from '@/types/domain';

const GLOSSARY = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'data', 'glossary', 'en.json'), 'utf-8'),
) as {
  terms: { term: string; plain_definition: string; source_id: string | null }[];
};

function claim(text: string, ids: string[] = ['c1']): Claim {
  return { text, citation_ids: ids };
}

function block(kind: AnswerBlock['kind'], claims: Claim[]): AnswerBlock {
  return {
    id: `${kind}-0`,
    kind,
    text: claims.map((c) => c.text).join(' '),
    citation_ids: [...new Set(claims.flatMap((c) => c.citation_ids))],
    claims,
  };
}

function answer(blocks: AnswerBlock[]): Answer {
  return {
    answer_id: 'a-1',
    query_id: 'q-1',
    jurisdiction: 'IN',
    language: 'en',
    product_class: 'undetermined',
    ip_rights: [],
    regulatory_areas: [],
    blocks,
    citations: [],
    related_records: [],
    confidence: 'moderate',
    abstained: false,
    abstain_reason: null,
    escalation_offered: true,
    as_of_date: '2026-09-22',
    corpus_version: 'kb-2026.09.22',
    latency_ms: 10,
    is_demo: false,
    analysis: null,
  };
}

const LONG = Array.from({ length: 12 }, (_, i) => claim(`Sentence number ${i} has five words.`));

describe('in short', () => {
  it('never contains a sentence the answer did not already make', () => {
    const full = answer([block('answer', LONG)]);
    const { claims } = summarise(full);
    const original = new Set(LONG.map((c) => c.text));
    for (const kept of claims) {
      expect(original.has(kept.text)).toBe(true);
    }
  });

  it('stops at the word limit rather than cutting a sentence in half', () => {
    const { claims } = summarise(answer([block('answer', LONG)]));
    const words = claims.join(' ').split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(WORD_LIMIT + 6);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.length).toBeLessThan(LONG.length);
  });

  it('keeps the citations of every sentence it shows', () => {
    const { claims } = summarise(answer([block('answer', LONG)]));
    expect(claims.every((kept) => kept.citation_ids.length > 0)).toBe(true);
  });

  it('renders nothing when the answer is already short', () => {
    const short = answer([block('answer', [claim('One short sentence.')])]);
    const { container } = render(<InShort answer={short} numbering={new Map()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows what this means for you from the what-to-check block', () => {
    const full = answer([
      block('answer', LONG),
      block('what_to_check', [claim('File Form 18 to request examination.')]),
    ]);
    render(<InShort answer={full} numbering={new Map()} />);
    expect(screen.getByText(/what this means for you/i)).toBeInTheDocument();
    expect(screen.getByText(/File Form 18/)).toBeInTheDocument();
  });
});

describe('the detail level', () => {
  beforeEach(() => localStorage.clear());

  it('offers simple and expert as a real choice, not an on/off switch', () => {
    render(<DetailToggle level="simple" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /simple/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /expert/i })).not.toBeChecked();
  });

  it('reports the level a reader picks', async () => {
    const picked: string[] = [];
    render(<DetailToggle level="simple" onChange={(next) => picked.push(next)} />);
    await userEvent.click(screen.getByRole('radio', { name: /expert/i }));
    expect(picked).toEqual(['expert']);
  });
});

describe('the glossary', () => {
  it('defines every term the phase lists', () => {
    const terms = GLOSSARY.terms.map((entry) => entry.term.toLowerCase());
    for (const wanted of [
      'abs',
      'nba',
      'pct',
      'paris priority',
      'tkdl',
      'prior art',
      'section 3(p)',
      'schedule t',
      'rule 158b',
      'ayurveda aahara',
      'proprietary medicine',
      'biological resource',
    ]) {
      expect(terms).toContain(wanted);
    }
  });

  it('keeps every definition short enough to read in passing', () => {
    for (const entry of GLOSSARY.terms) {
      const words = entry.plain_definition.trim().split(/\s+/).length;
      expect(words, `${entry.term} is ${words} words`).toBeLessThanOrEqual(25);
    }
  });

  it('never claims a source it does not name', () => {
    for (const entry of GLOSSARY.terms) {
      // Either it points at a document the corpus holds, or it is explicitly
      // an explainer with no source. There is no third state where a
      // definition implies authority it cannot show.
      expect(entry.source_id === null || entry.source_id.length > 0).toBe(true);
    }
  });

  it('points only at documents the corpus actually holds', () => {
    const corpus = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '..', 'corpus', 'guidance', 'knowledge-base.json'),
        'utf-8',
      ),
    ) as { chunks: { document_id: string }[] };
    const known = new Set(corpus.chunks.map((chunk) => chunk.document_id));
    for (const entry of GLOSSARY.terms) {
      if (entry.source_id) expect(known, `${entry.term}`).toContain(entry.source_id);
    }
  });
});

describe('accessibility', () => {
  const analysis: Analysis = {
    facts: [],
    missing_facts: [{ key: 'therapeutic_claim', question: 'Does it treat a disease?' }],
    product_class: 'undetermined',
    alternative_classes: [],
    classification_rule_id: null,
    changes_if: null,
    issues: [],
    conflicts: [],
    applicability: [],
    escalation: { level: 'l2', reason_keys: [], specialists: ['registered_patent_agent'] },
    abstain_code: null,
    unsupported_jurisdictions: [],
  };

  async function violations(container: HTMLElement): Promise<string[]> {
    const results = await axe.run(container, { resultTypes: ['violations'] });
    return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
  }

  it('has no violations on where guidance ends', async () => {
    const { container } = render(<GuidanceEnds analysis={analysis} />);
    expect(await violations(container)).toEqual([]);
  }, 30_000);

  it('has no violations on the detail toggle', async () => {
    const { container } = render(<DetailToggle level="simple" onChange={() => {}} />);
    expect(await violations(container)).toEqual([]);
  }, 30_000);

  it('has no violations on the case brief', async () => {
    const { container } = render(
      <CaseBrief
        answer={{ ...answer([block('answer', LONG)]), analysis }}
        question="Can a classical formulation be patented?"
      />,
    );
    expect(await violations(container)).toEqual([]);
  }, 30_000);
});
