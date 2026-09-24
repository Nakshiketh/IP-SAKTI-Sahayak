/**
 * Phase 5 part two: the glossary surface, the hints, and the timeout.
 *
 * The promises: a glossary that fires only on words the reader actually met and
 * never passes an explainer off as authority; three hints that stay dismissed;
 * and a timeout that offers the one action that helps.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { GlossaryNotes } from '@/components/answer/GlossaryNotes';
import { FirstVisitHint } from '@/components/sahayak/FirstVisitHint';
import { QueryFailure } from '@/components/sahayak/QueryFailure';
import { termsIn } from '@/lib/glossary';
import type { Answer, AnswerBlock } from '@/types/domain';

function answerSaying(text: string): Answer {
  const block: AnswerBlock = {
    id: 'answer-0',
    kind: 'answer',
    text,
    citation_ids: [],
    claims: [{ text, citation_ids: [] }],
  };
  return {
    answer_id: 'a-1',
    query_id: 'q-1',
    jurisdiction: 'IN',
    language: 'en',
    product_class: 'undetermined',
    ip_rights: [],
    regulatory_areas: [],
    blocks: [block],
    citations: [],
    related_records: [],
    confidence: 'moderate',
    abstained: false,
    abstain_reason: null,
    escalation_offered: true,
    as_of_date: null,
    corpus_version: null,
    latency_ms: null,
    is_demo: false,
    analysis: null,
  };
}

describe('finding glossary terms', () => {
  it('matches a term the text actually uses', () => {
    expect(termsIn('You may need NBA approval first.').map((t) => t.term)).toContain('NBA');
  });

  it('does not fire on a word that merely contains an abbreviation', () => {
    // "abs" inside "absolute" is not access and benefit sharing, and a glossary
    // that says it is teaches the reader to stop reading it.
    expect(termsIn('This is an absolute requirement.').map((t) => t.term)).not.toContain('ABS');
  });

  it('matches a multi-word term case-insensitively', () => {
    expect(termsIn('Consider the prior art before filing.').map((t) => t.term)).toContain(
      'prior art',
    );
  });

  it('finds nothing in text that uses no jargon', () => {
    expect(termsIn('Write down what you made and when.')).toEqual([]);
  });
});

describe('the glossary notes', () => {
  it('explains only the terms this answer used', () => {
    render(<GlossaryNotes answer={answerSaying('You may need NBA approval before filing.')} />);
    expect(screen.getByText(/one term explained/i)).toBeInTheDocument();
  });

  it('marks a definition with no source as a plain-language explainer', async () => {
    render(<GlossaryNotes answer={answerSaying('Consider the prior art first.')} />);
    await userEvent.click(screen.getByText(/one term explained/i));
    expect(screen.getByText(/plain-language explainer/i)).toBeInTheDocument();
  });

  it('renders nothing when the answer used no jargon', () => {
    const { container } = render(<GlossaryNotes answer={answerSaying('Keep dated records.')} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('first-visit hints', () => {
  beforeEach(() => localStorage.clear());

  it('shows once and stays dismissed', async () => {
    const { unmount } = render(<FirstVisitHint id="start" />);
    expect(await screen.findByText(/start by asking/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(screen.queryByText(/start by asking/i)).not.toBeInTheDocument();

    unmount();
    render(<FirstVisitHint id="start" />);
    expect(screen.queryByText(/start by asking/i)).not.toBeInTheDocument();
  });

  it('dismisses one hint without dismissing the others', async () => {
    render(<FirstVisitHint id="start" />);
    await userEvent.click(await screen.findByRole('button', { name: /got it/i }));

    render(<FirstVisitHint id="escalation" />);
    expect(await screen.findByText(/where guidance ends/i)).toBeInTheDocument();
  });
});

describe('a request that times out', () => {
  it('offers a shorter question, which is the action that helps', async () => {
    let shortened = false;
    render(<QueryFailure code="timeout" onRetry={() => {}} onShorten={() => (shortened = true)} />);
    expect(screen.getByText(/took too long/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /shorter question/i }));
    expect(shortened).toBe(true);
  });

  it('does not offer it for a failure a shorter question cannot fix', () => {
    render(<QueryFailure code="unreachable" onRetry={() => {}} onShorten={() => {}} />);
    expect(screen.queryByRole('button', { name: /shorter question/i })).not.toBeInTheDocument();
  });

  it('never apologises', () => {
    render(<QueryFailure code="timeout" onRetry={() => {}} />);
    expect(document.body.textContent?.toLowerCase()).not.toContain('sorry');
  });
});
