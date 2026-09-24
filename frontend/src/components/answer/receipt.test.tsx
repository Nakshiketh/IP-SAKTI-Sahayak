/**
 * The four surfaces that let someone check the answer rather than trust it:
 * provenance, the receipt, the protection map and the case brief.
 *
 * What each is tested for is the thing it would be easiest to get wrong. The
 * ranking signal must never read as confidence. The receipt must report claims
 * that were removed. The map must keep "not indicated" and "needs more
 * information" apart. The brief must carry every field a reviewer needs.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AnswerReceipt } from '@/components/answer/AnswerReceipt';
import { CaseBrief } from '@/components/answer/CaseBrief';
import { Provenance } from '@/components/answer/Provenance';
import { ProtectionMap, type ProtectionEntry } from '@/components/answer/ProtectionMap';
import { SourceMatrix } from '@/components/answer/SourceMatrix';
import type { Analysis, Answer, Citation } from '@/types/domain';

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    citation_id: 'c1',
    chunk_id: 'c1',
    document_id: 'in-patents-act-1970',
    document_title: 'The Patents Act, 1970',
    organization: 'Ministry of Commerce and Industry',
    jurisdiction: 'IN',
    section_label: 'Section 3(p)',
    page: null,
    url: 'https://ipindia.gov.in/patents.pdf',
    retrieval_score: 0.8,
    rerank_score: 0.72,
    verification_status: 'verified',
    as_of_date: '2026-09-22',
    review_state: 'verified_official',
    reviewed_at: '2026-09-22',
    provenance_pending: false,
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    facts: [{ key: 'external_use', value: true, span: 'a face pack' }],
    missing_facts: [{ key: 'therapeutic_claim', question: 'Does it treat a disease?' }],
    product_class: 'cosmetic',
    alternative_classes: [],
    classification_rule_id: 'cls-cosmetic',
    changes_if: 'a therapeutic claim is made',
    issues: [
      {
        issue: 'patent',
        status: 'indicated',
        reason_keys: [],
        citation_ids: [],
        confidence: 'moderate',
        confidence_reason_keys: [],
        missing_facts: [],
      },
    ],
    conflicts: [],
    applicability: [],
    escalation: { level: 'l2', reason_keys: [], specialists: ['registered_patent_agent'] },
    abstain_code: null,
    unsupported_jurisdictions: [],
    ...overrides,
  };
}

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    answer_id: 'a-1',
    query_id: 'q-1',
    jurisdiction: 'IN',
    language: 'en',
    product_class: 'cosmetic',
    ip_rights: [],
    regulatory_areas: [],
    blocks: [],
    citations: [citation()],
    related_records: [],
    confidence: 'moderate',
    abstained: false,
    abstain_reason: null,
    escalation_offered: true,
    as_of_date: '2026-09-22',
    corpus_version: 'kb-2026.09.22',
    latency_ms: 20,
    is_demo: false,
    analysis: analysis(),
    ...overrides,
  };
}

describe('provenance', () => {
  it('labels the ranking signal as a ranking signal, not confidence', () => {
    render(<Provenance citation={citation()} passage="The provision text." />);
    expect(screen.getByText('The provision text.')).toBeInTheDocument();
    expect(screen.getByText(/not how confident the answer is/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.72/)).toBeInTheDocument();
  });

  it('says how far the source has been checked and when', () => {
    render(<Provenance citation={citation()} />);
    expect(screen.getByText(/fetched from the official host/i)).toBeInTheDocument();
    // The date appears twice: last confirmed, and read on.
    expect(screen.getAllByText('2026-09-22')).toHaveLength(2);
  });

  it('marks a source cited on provenance that is still pending', () => {
    render(
      <Provenance
        citation={citation({ provenance_pending: true, review_state: 'needs_review' })}
      />,
    );
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });
});

describe('the answer receipt', () => {
  it('reports claims that were removed', async () => {
    render(<AnswerReceipt answer={answer()} droppedClaims={2} />);
    await userEvent.click(screen.getByText(/answer receipt/i));
    expect(screen.getByText(/claims removed/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('carries the corpus version and the source review dates', async () => {
    render(<AnswerReceipt answer={answer()} />);
    await userEvent.click(screen.getByText(/answer receipt/i));
    expect(screen.getByText('kb-2026.09.22')).toBeInTheDocument();
    expect(screen.getAllByText('2026-09-22').length).toBeGreaterThan(0);
  });

  it('reports confidence per issue rather than one number for everything', async () => {
    render(<AnswerReceipt answer={answer()} />);
    await userEvent.click(screen.getByText(/answer receipt/i));
    expect(screen.getByText(/patent —/i)).toBeInTheDocument();
  });

  it('says plainly when no source has been confirmed by a person', async () => {
    render(<AnswerReceipt answer={answer({ citations: [citation({ reviewed_at: null })] })} />);
    await userEvent.click(screen.getByText(/answer receipt/i));
    expect(screen.getByText(/no source has been confirmed/i)).toBeInTheDocument();
  });
});

describe('the protection map', () => {
  const entries: ProtectionEntry[] = [
    {
      right: 'trademark',
      relevance: 'needs_more_information',
      reason_keys: ['protectionNeedBrand'],
      facts_required: [{ key: 'brand_name', question: 'Is a brand name involved?' }],
      source_ids: [],
      next_step_key: 'protectionStepDecideName',
    },
    {
      right: 'geographical_indication',
      relevance: 'not_indicated',
      reason_keys: ['protectionNoOriginClaim'],
      facts_required: [],
      source_ids: [],
      next_step_key: null,
    },
  ];

  it('keeps "needs more information" and "not indicated" apart', () => {
    render(<ProtectionMap entries={entries} />);
    expect(screen.getByText('Needs more information')).toBeInTheDocument();
    expect(screen.getByText('Not indicated')).toBeInTheDocument();
  });

  it('shows why, the facts that would settle it, and a next step when opened', async () => {
    render(<ProtectionMap entries={entries} />);
    await userEvent.click(screen.getByRole('button', { name: /trade mark/i }));
    expect(screen.getByText(/nothing yet says whether a name or logo/i)).toBeInTheDocument();
    expect(screen.getByText('Is a brand name involved?')).toBeInTheDocument();
    expect(screen.getByText(/decide whether you will sell under a name/i)).toBeInTheDocument();
  });

  it('renders nothing when there is no map to show', () => {
    const { container } = render(<ProtectionMap entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the source matrix', () => {
  it('lists one row per document, not one per passage', () => {
    render(
      <SourceMatrix citations={[citation(), citation({ citation_id: 'c2', chunk_id: 'c2' })]} />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('The Patents Act, 1970')).toHaveLength(1);
  });

  it('says when a source has not been confirmed by a person', () => {
    render(<SourceMatrix citations={[citation({ reviewed_at: null })]} />);
    expect(screen.getAllByText(/not yet/i).length).toBeGreaterThan(0);
  });
});

describe('the case brief', () => {
  it('carries every section a reviewer needs', () => {
    render(<CaseBrief answer={answer()} question="Can we patent our face pack?" />);
    for (const heading of [
      /the question asked/i,
      /facts stated/i,
      /facts still missing/i,
      /classification/i,
      /issues and confidence/i,
      /sources and excerpts/i,
      /suggested specialists/i,
      /audit information/i,
    ]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
  });

  it('shows the facts in the reader’s own words, so a misreading is catchable', () => {
    render(<CaseBrief answer={answer()} question="Can we patent our face pack?" />);
    expect(screen.getByText(/a face pack/)).toBeInTheDocument();
  });

  it('offers copy, export and print rather than generating a PDF itself', () => {
    render(<CaseBrief answer={answer()} question="Can we patent our face pack?" />);
    expect(screen.getByRole('button', { name: /copy summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });
});
