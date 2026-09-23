/**
 * Citation is part of the answer, not a footer.
 *
 * These test the thing a reader has to be able to do at a glance: tell which
 * sentences rest on a retrieved passage and which do not.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AnswerView } from '@/components/answer';
import { DEMO_ANSWERS } from '@/services/answers.mock';

function renderAnswer(jurisdiction: 'IN' | 'INTL' = 'IN') {
  const answer = DEMO_ANSWERS[jurisdiction];
  return {
    answer,
    ...render(<AnswerView answer={answer} confidenceReason="Based on 4 illustrative passages." />),
  };
}

describe('claim-level citation', () => {
  it('numbers each marker by its position in the source list', () => {
    const { answer } = renderAnswer();
    const first = answer.citations[0]!;
    expect(
      screen.getAllByRole('button', {
        name: `Source 1: ${first.document_title}`,
      }).length,
    ).toBeGreaterThan(0);
  });

  it('names the document in the marker, so it is not a bare number to a screen reader', () => {
    renderAnswer();
    const markers = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label')?.startsWith('Source '));
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker.getAttribute('aria-label')).toMatch(/^Source \d+: .+/);
    }
  });

  it('marks a sentence that rests on nothing, and says why', () => {
    const { answer } = renderAnswer();
    const uncited = answer.blocks
      .flatMap((block) => block.claims)
      .filter((claim) => claim.citation_ids.length === 0);
    expect(uncited.length).toBeGreaterThan(0);

    const sentence = screen.getByText(uncited[0]!.text);
    // Reachable by keyboard: a dashed underline is invisible to someone who
    // cannot hover, and this is the most important distinction on the page.
    expect(sentence).toHaveAttribute('tabindex', '0');

    const describedBy = sentence.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'General explanation, not from a specific source.',
    );
  });

  it('highlights the source a marker points at when it is followed', async () => {
    const user = userEvent.setup();
    const { answer } = renderAnswer();
    const first = answer.citations[0]!;

    const marker = screen.getAllByRole('button', {
      name: `Source 1: ${first.document_title}`,
    })[0]!;
    await user.click(marker);

    const card = document.getElementById(`${answer.answer_id}-source-${first.citation_id}`);
    expect(card).toHaveClass('bg-stamp/[0.06]');
  });
});

describe('the answer header', () => {
  it('states jurisdiction, product class and the absence of a source date', () => {
    renderAnswer();
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('Patent or proprietary medicine')).toBeInTheDocument();
    // No corpus has been ingested, so there is no "as of" date to show.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('never shows confidence without its reason', () => {
    renderAnswer();
    expect(screen.getByText('Based on 4 illustrative passages.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Moderate confidence: 3 of 4/ })).toBeInTheDocument();
  });
});

describe('source cards', () => {
  it('carries one source note for the answer, not a marking on every card', () => {
    renderAnswer();
    const sources = screen.getAllByRole('article');
    expect(sources.length).toBeGreaterThan(0);
    for (const card of sources) {
      expect(within(card).queryByText('demo')).not.toBeInTheDocument();
      expect(within(card).queryByText('verified')).not.toBeInTheDocument();
    }
    // The provenance is stated once, under the answer.
    expect(screen.getByText(/Check the official text before you rely/i)).toBeInTheDocument();
  });

  it('says plainly when there is no link to the source yet', () => {
    renderAnswer();
    expect(screen.getAllByText('Link not available').length).toBeGreaterThan(0);
  });
});
