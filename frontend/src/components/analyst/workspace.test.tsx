/**
 * The roadmap a reader sees, and the feedback control beside an answer.
 *
 * Two promises worth holding in the interface as well as the backend: a task
 * can never be shown as filed or approved, and asking whether an answer helped
 * must not turn into a box that collects descriptions of unpublished products.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Roadmap } from '@/components/analyst/Roadmap';
import { AnswerFeedback } from '@/components/sahayak/AnswerFeedback';
import type { RoadmapTask } from '@/services/analyst';
import type { QueryResult } from '@/services/query';

afterEach(() => vi.restoreAllMocks());

function task(overrides: Partial<RoadmapTask> = {}): RoadmapTask {
  return {
    task_id: 'confirm-classification',
    why_key: 'roadmapWhyClassification',
    status: 'ready',
    when: 'now',
    issue: null,
    source_ids: [],
    depends_on: [],
    needs_facts: [],
    ...overrides,
  };
}

const RESULT = {
  jurisdiction: 'IN',
  confidence: { level: 'moderate' },
  answer: { citations: [] },
} as unknown as QueryResult;

describe('the roadmap', () => {
  it('says what a task is for, not just what it is', () => {
    render(<Roadmap tasks={[task()]} />);
    expect(screen.getByText(/confirm what your product is/i)).toBeInTheDocument();
    expect(screen.getByText(/everything else follows from the category/i)).toBeInTheDocument();
  });

  it('names what a task is waiting on', () => {
    render(
      <Roadmap
        tasks={[
          task({
            task_id: 'structured-prior-art-search',
            why_key: 'roadmapWhyPriorArt',
            status: 'needs_information',
            when: 'before_filing',
            depends_on: ['confirm-classification'],
          }),
        ]}
      />,
    );
    // The standfirst also mentions waiting, so match the line itself.
    expect(screen.getByText(/^Waits on:/)).toHaveTextContent(
      'Confirm what your product is, regulatorily',
    );
  });

  it('groups tasks by when they bite', () => {
    render(
      <Roadmap tasks={[task(), task({ task_id: 'check-target-markets', when: 'before_sale' })]} />,
    );
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText(/before you sell/i)).toBeInTheDocument();
  });

  it('never offers a status that claims a filing or an approval', () => {
    const statuses = [
      'not_started',
      'needs_information',
      'ready',
      'requires_expert_review',
      'completed_by_user',
    ];
    render(<Roadmap tasks={statuses.map((status, i) => task({ task_id: `t${i}`, status }))} />);
    const text = document.body.textContent?.toLowerCase() ?? '';
    for (const forbidden of ['filed', 'approved', 'granted', 'registered']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('says whose record a completed task is', () => {
    render(<Roadmap tasks={[task({ status: 'completed_by_user' })]} />);
    expect(screen.getByText(/your record/i)).toBeInTheDocument();
  });

  it('renders nothing when there is no roadmap', () => {
    const { container } = render(<Roadmap tasks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('feedback on an answer', () => {
  it('offers three verdicts, not a scale', async () => {
    render(<AnswerFeedback result={RESULT} />);
    expect(screen.getByRole('button', { name: /^yes$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^partly$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^no$/i })).toBeInTheDocument();
  });

  it('sends the shape of the answer and nothing about the reader', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    render(<AnswerFeedback result={RESULT} />);
    await userEvent.click(screen.getByRole('button', { name: /^yes$/i }));

    const body = JSON.parse(String((spy.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({ verdict: 'yes', jurisdiction: 'IN', confidence: 'moderate' });
    for (const forbidden of ['session_id', 'query_id', 'note', 'user']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('asks which part only when the answer did not fully help', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    render(<AnswerFeedback result={RESULT} />);
    await userEvent.click(screen.getByRole('button', { name: /^partly$/i }));
    expect(screen.getByText(/which part needs work/i)).toBeInTheDocument();
    // A fixed list, never a text box.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not press someone who said yes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    render(<AnswerFeedback result={RESULT} />);
    await userEvent.click(screen.getByRole('button', { name: /^yes$/i }));
    expect(screen.queryByText(/which part needs work/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/nothing identifying you/i);
  });

  it('stays quiet when the verdict cannot be sent', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(<AnswerFeedback result={RESULT} />);
    await userEvent.click(screen.getByRole('button', { name: /^yes$/i }));
    // Nothing the reader was doing depended on it, so nothing interrupts them.
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });
});
