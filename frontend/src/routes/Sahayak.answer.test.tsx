/**
 * The answer experience.
 *
 * The rules worth guarding here are the ones that would be quietly expensive to
 * break: an abstention must never read as a thin answer, records must never
 * rescue one, and confidence must come from the scoring function rather than
 * from a field somebody typed.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import Sahayak from '@/routes/Sahayak';
import { buildMockResult, classifyQuestion } from '@/services/query.mock';

function setViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: min ? width >= Number(min[1]) : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  });
}

/**
 * Asking is a request now, even against the mock, so every call settles first.
 * The three markers below are the three terminal states of the workspace, and
 * waiting for any of them is what "the query finished" means.
 */
async function ask(question: string) {
  const view = render(
    <MemoryRouter initialEntries={[`/sahayak?q=${encodeURIComponent(question)}`]}>
      <Sahayak />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      document.querySelector('[data-answered], [data-abstained], [data-failed]'),
    ).not.toBeNull(),
  );
  return view;
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  setViewport(1440);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('all five abstention states can be reached', () => {
  it.each([
    ['What dose should a 60-year-old take?', 'out_of_scope', 'This is outside what I can answer'],
    [
      'What are the rules in Brazil?',
      'nothing_relevant',
      "I couldn't find anything in these sources",
    ],
    ['Do the sources conflict on this?', 'sources_conflict', 'point different ways'],
    ['Is this rule superseded?', 'sources_out_of_date', 'outside its effective window'],
    [
      'Is our product a medicine or a food?',
      'needs_more_facts',
      'turns on something only you can tell me',
    ],
  ])('%s abstains with reason %s', async (question, reason, heading) => {
    const result = buildMockResult(question, 'IN');
    expect(result.answer).toBeNull();
    expect(result.confidence.level).toBe('abstain');
    expect(result.confidence.abstainReason).toBe(reason);

    const { container } = await ask(question);
    const region = container.querySelector('[data-abstained="true"]') as HTMLElement;
    expect(within(region).getByText(new RegExp(heading, 'i'))).toBeInTheDocument();
  });

  it('marks the abstention in the DOM so it cannot be mistaken for an answer', async () => {
    const { container } = await ask('What dose should a 60-year-old take?');
    const region = container.querySelector('[data-abstained="true"]');
    expect(region).toBeTruthy();
    expect(region).toHaveAttribute('data-abstain-reason', 'out_of_scope');
    // No answer blocks at all — there is no partial answer above the decline.
    expect(screen.queryByRole('heading', { name: 'Answer' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'What to check' })).toBeNull();
  });

  it('offers a way forward rather than a dead end', async () => {
    await ask('What are the rules in Brazil?');
    for (const label of [
      'Rephrase the question',
      'Pick a jurisdiction',
      'Name the product type',
      "See what's covered",
      'Send this to a human',
    ]) {
      expect(
        screen.getByRole(label === "See what's covered" ? 'link' : 'button', { name: label }),
      ).toBeInTheDocument();
    }
  });

  it('shows both passages when the sources disagree, rather than picking one', async () => {
    await ask('Do the sources conflict on this?');
    const region = document.querySelector('[data-abstained="true"]')!;
    expect(within(region as HTMLElement).getAllByRole('article').length).toBeGreaterThanOrEqual(2);
  });
});

describe('records never rescue an abstention', () => {
  it('attaches records to an abstention and still abstains', async () => {
    const user = userEvent.setup();
    // This question routes to "nothing relevant" and also matches records.
    const question = 'What are the rules in Brazil for our herbal formulation patent?';
    const result = buildMockResult(question, 'IN');

    expect(result.relatedRecords.length).toBeGreaterThan(0);
    expect(result.answer).toBeNull();
    expect(result.confidence.level).toBe('abstain');

    await ask(question);
    expect(document.querySelector('[data-abstained="true"]')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Related records/ }));
    expect(screen.getByText(/These records do not answer the question/)).toBeInTheDocument();
    expect(screen.getByText(/The system still declined/)).toBeInTheDocument();
  });

  it('gives the confidence function no way to see them', async () => {
    const withRecords = buildMockResult('our herbal formulation patent in Brazil', 'IN');
    const withoutRecords = buildMockResult('the rules in Brazil', 'IN');
    expect(withRecords.relatedRecords.length).toBeGreaterThan(0);
    expect(withoutRecords.relatedRecords).toHaveLength(0);
    // Same evidence, same level, whatever records came along.
    expect(withRecords.confidence.level).toBe(withoutRecords.confidence.level);
  });
});

describe('confidence comes from the scoring function', () => {
  it('differs between jurisdictions because their evidence differs', async () => {
    const india = buildMockResult('What should we work out first?', 'IN');
    const uk = buildMockResult('What should we work out first?', 'INTL');
    expect(india.confidence.level).toBe('high');
    expect(uk.confidence.level).toBe('low');
    expect(india.answer?.confidence).toBe('high');
  });

  it('shows the level with its reason, never a bare number', async () => {
    await ask('What should we work out first?');
    expect(screen.getByRole('img', { name: /High confidence: 4 of 4/ })).toBeInTheDocument();
    expect(screen.getByText(/Based on 4 passages from 4 current sources\./)).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).toBeNull();
  });
});

describe('retrieval status', () => {
  it('collapses to one summary line that expands to the scores', async () => {
    const user = userEvent.setup();
    await ask('What should we work out first?');

    const summary = screen.getByRole('button', { name: /passages from .* documents/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');

    await user.click(summary);
    expect(screen.getByText('Stage by stage')).toBeInTheDocument();
    expect(screen.getByText('Passages considered')).toBeInTheDocument();
    // Both scores per passage, as numbers rather than a bar alone.
    expect(screen.getAllByText(/retrieval 0\.\d\d · rerank 0\.\d\d/).length).toBeGreaterThan(0);
  });

  it('says plainly when nothing cleared the threshold', async () => {
    await ask('What are the rules in Brazil?');
    expect(screen.getByText(/No passages cleared the threshold/)).toBeInTheDocument();
  });
});

describe('follow-ups and handoff', () => {
  it('offers follow-ups drawn from what the answer left open', async () => {
    const result = buildMockResult('What should we work out first?', 'IN');
    expect(result.followUps.length).toBeGreaterThan(0);
    await ask('What should we work out first?');
    expect(screen.getByText('Where this leaves off')).toBeInTheDocument();
  });

  it('packages the question and every source into a handoff summary', async () => {
    const user = userEvent.setup();
    await ask('What should we work out first?');

    await user.click(screen.getByRole('button', { name: 'Get someone to look at this' }));
    const dialog = screen.getByRole('dialog', { name: 'Send this to a human' });
    const summary = within(dialog).getByRole('textbox', { name: 'Summary' });

    const value = (summary as HTMLTextAreaElement).value;
    expect(value).toContain('What should we work out first?');
    expect(value).toContain('The Patents Act, 1970');
    expect(value).toContain('India');
    // It does not pretend there is a queue behind the button.
    expect(within(dialog).getByText(/no expert network behind this button/i)).toBeInTheDocument();
  });
});

describe('classification of questions', () => {
  it('routes clinical and outcome questions out of scope', async () => {
    expect(classifyQuestion('What dosage is safe?')).toBe('out_of_scope');
    expect(classifyQuestion('Will our patent be granted?')).toBe('out_of_scope');
    expect(classifyQuestion('Can you draft the application for us?')).toBe('out_of_scope');
  });

  it('answers an ordinary question', async () => {
    expect(classifyQuestion('Can we register our brand name?')).toBe('answer');
  });
});

describe('accessibility of the answer surface', () => {
  it('has no axe violations on an answer', async () => {
    const { container } = await ask('What should we work out first?');
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);

  it('has no axe violations on an abstention', async () => {
    const { container } = await ask('What dose should a 60-year-old take?');
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});

describe('flows are offered by answers, never from navigation', () => {
  it('offers the classification flow while the product type is unknown', async () => {
    await ask('What should we work out first?');
    // One heading for the group, however many flows are offered.
    expect(screen.getAllByText('This depends on something the answer does not know')).toHaveLength(
      1,
    );
    expect(screen.getByRole('button', { name: 'Work out the product type' })).toBeInTheDocument();
  });

  it('offers it on an abstention that turns on the product type', async () => {
    await ask('Is our product a medicine or a food?');
    expect(document.querySelector('[data-abstained="true"]')).toBeTruthy();
    // The gap the abstention names is exactly the gap the flow fills.
    expect(
      screen.getAllByText(/depends on what your product is regulatorily/i).length,
    ).toBeGreaterThan(0);
  });

  it('opens the flow and sets the product type into the session context', async () => {
    const user = userEvent.setup();
    await ask('What should we work out first?');

    await user.click(screen.getByRole('button', { name: 'Work out the product type' }));
    const dialog = screen.getByRole('dialog', { name: 'What is your product, regulatorily?' });
    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Use this as my product type' }));

    // The context line above the composer now names it.
    expect(screen.getByRole('button', { name: /product: Cosmetic/ })).toBeInTheDocument();
  });

  it('stops offering the classification flow once the product type is known', async () => {
    const user = userEvent.setup();
    await ask('What should we work out first?');

    await user.click(screen.getByRole('button', { name: 'Work out the product type' }));
    const dialog = screen.getByRole('dialog', { name: 'What is your product, regulatorily?' });
    await user.click(within(dialog).getByRole('button', { name: 'Yes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Use this as my product type' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Work out the product type' })).toBeNull();
  });

  it('is reachable from nowhere else — the flows are not navigation', async () => {
    await ask('What should we work out first?');
    const nav = screen.queryByRole('navigation');
    if (nav) {
      expect(within(nav).queryByText(/Work out the product type/)).toBeNull();
    }
  });
});
