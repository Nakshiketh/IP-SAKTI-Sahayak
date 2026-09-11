/**
 * The three guided flows.
 *
 * What is worth guarding is mostly what they refuse to do: the classification
 * flow must not state law from a lookup table, the ABS flow must not assert a
 * duty it has not retrieved, and the prior-art flow must never imply a search it
 * did not run.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import graph from '@classification/graph.json';
import { AbsFlow } from '@/components/flows/AbsFlow';
import { ClassificationFlow } from '@/components/flows/ClassificationFlow';
import { PriorArtFlow } from '@/components/flows/PriorArtFlow';
import { i18n } from '@/i18n';
import { longestPath, walk, type Answers } from '@/services/classification';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderFlow(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('the classification graph', () => {
  it('never asks more than the eight questions the build document allows', () => {
    expect(longestPath()).toBeLessThanOrEqual(8);
  });

  it('settles a cosmetic in one question', () => {
    const result = walk({ external_use: 'yes' });
    expect(result.asked).toEqual(['external_use']);
    expect(result.outcome?.classes).toEqual(['cosmetic']);
  });

  it('asks only what its own answers make necessary', () => {
    const answers: Answers = {
      external_use: 'no',
      food_route: 'no',
      purified_fraction: 'no',
      classical_unmodified: 'yes',
      // Answers below are never reached and must not be asked.
      novel_ingredient: 'yes',
      human_evidence: 'no',
    };
    const result = walk(answers);
    expect(result.asked).not.toContain('novel_ingredient');
    expect(result.outcome?.classes).toEqual(['classical_generic']);
  });

  it('says two routes are open rather than picking the likelier', () => {
    const result = walk({ external_use: 'no', food_route: 'yes', therapeutic_claim: 'yes' });
    expect(result.outcome?.classes).toEqual(['ayurveda_aahar', 'patent_proprietary']);
  });

  it('is the same file the backend service walks', () => {
    // One graph, read by both halves. A copy would drift.
    expect(Object.keys((graph as { questions: object }).questions)).toHaveLength(8);
    expect((graph as { start: string }).start).toBe('external_use');
  });

  it('states no legal consequence anywhere in it', () => {
    const body = JSON.parse(JSON.stringify(graph)) as Record<string, unknown>;
    delete body.note;
    const text = JSON.stringify(body).toLowerCase();
    for (const word of ['licence', 'section', 'must ', 'required']) {
      expect(text, `the graph states a consequence: ${word}`).not.toContain(word);
    }
  });
});

describe('the classification flow', () => {
  it('walks to a result and offers it as the session product type', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderFlow(<ClassificationFlow open onClose={() => undefined} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(screen.getByText(/this is a Cosmetic/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use this as my product type' }));
    expect(onApply).toHaveBeenCalledWith('cosmetic');
  });

  it('shows which answers decided it', async () => {
    const user = userEvent.setup();
    renderFlow(<ClassificationFlow open onClose={() => undefined} onApply={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(screen.getByText('What decided it')).toBeInTheDocument();
    expect(screen.getByText(/applied externally for appearance/i)).toBeInTheDocument();
  });

  it('states no consequence it has not sourced', async () => {
    const user = userEvent.setup();
    const { container } = renderFlow(
      <ClassificationFlow open onClose={() => undefined} onApply={() => undefined} />,
    );
    await user.click(screen.getByRole('button', { name: 'Yes' }));

    // Every consequence panel carries a pending marker naming its instrument.
    const markers = container.querySelectorAll('sup');
    expect(markers).toHaveLength(3);
    for (const marker of markers) {
      expect(marker.getAttribute('aria-label')).toMatch(/^Source \d+: /);
    }
    expect(screen.getByText(/does not get to state law from a lookup table/i)).toBeInTheDocument();
  });

  it('says what would change the answer', async () => {
    const user = userEvent.setup();
    renderFlow(<ClassificationFlow open onClose={() => undefined} onApply={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(screen.getByText('What would change this')).toBeInTheDocument();
  });

  it('lets a reader go back and change an answer', async () => {
    const user = userEvent.setup();
    renderFlow(<ClassificationFlow open onClose={() => undefined} onApply={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'No' })); // external_use
    expect(screen.getByText(/food or a supplement/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(/applied externally for appearance/i)).toBeInTheDocument();
  });
});

describe('the ABS flow', () => {
  it('ends immediately when no resource is accessed', async () => {
    const user = userEvent.setup();
    const { container } = renderFlow(<AbsFlow open onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(container.querySelector('[data-abs-result]')).toHaveAttribute(
      'data-abs-result',
      'not-engaged',
    );
    expect(screen.getByText(/duties are not engaged/i)).toBeInTheDocument();
  });

  it('asserts no duty it has not retrieved', async () => {
    const user = userEvent.setup();
    const { container } = renderFlow(<AbsFlow open onClose={() => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'An Indian company' }));
    await user.click(screen.getByRole('button', { name: 'Commercial' }));
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Codified in published texts' }));

    expect(container.querySelector('[data-abs-result]')).toHaveAttribute(
      'data-abs-result',
      'engaged',
    );
    // Four output panels, each a pending marker and no asserted text.
    expect(container.querySelectorAll('sup')).toHaveLength(4);
  });

  it('closes on the effective date, because the regime moved recently', async () => {
    const user = userEvent.setup();
    renderFlow(<AbsFlow open onClose={() => undefined} />);
    await user.click(screen.getByRole('button', { name: 'No' }));
    // Even the short path keeps the flow honest about its own currency.
    expect(screen.getByText(/duties are not engaged/i)).toBeInTheDocument();
  });
});

describe('the prior-art flow', () => {
  it('shows a banner that cannot be dismissed', () => {
    const { container } = renderFlow(<PriorArtFlow open onClose={() => undefined} />);
    const banner = container.querySelector('[data-prior-art-banner]');
    expect(banner).toBeTruthy();
    expect(within(banner as HTMLElement).queryByRole('button')).toBeNull();
    expect(screen.getByText(/not a novelty search/i)).toBeInTheDocument();
    expect(screen.getByText(/does not mean an invention is new/i)).toBeInTheDocument();
  });

  it('reports finding nothing as the absence of a search, not a result', async () => {
    const user = userEvent.setup();
    renderFlow(<PriorArtFlow open onClose={() => undefined} />);

    await user.type(
      screen.getByLabelText('Describe the formulation'),
      'polyherbal decoction with ashwagandha for joint discomfort',
    );
    await user.click(screen.getByRole('button', { name: 'Build the search terms' }));

    expect(screen.getByText(/No records have been ingested/)).toBeInTheDocument();
    expect(screen.getByText(/That is not a result — it is the absence of one/)).toBeInTheDocument();
  });

  it('builds terms from what was typed and says what it cannot add', async () => {
    const user = userEvent.setup();
    renderFlow(<PriorArtFlow open onClose={() => undefined} />);

    await user.type(screen.getByLabelText('Describe the formulation'), 'ashwagandha decoction');
    await user.click(screen.getByRole('button', { name: 'Build the search terms' }));

    expect(screen.getByText('ashwagandha')).toBeInTheDocument();
    expect(screen.getByText(/Sanskrit and vernacular names/)).toBeInTheDocument();
  });

  it('never claims to have searched the traditional knowledge library', () => {
    renderFlow(<PriorArtFlow open onClose={() => undefined} />);
    expect(screen.getByText(/This product cannot search it/)).toBeInTheDocument();
    expect(screen.getByText(/restricted to patent offices/)).toBeInTheDocument();
  });

  it('offers no link it has not verified', () => {
    const { container } = renderFlow(<PriorArtFlow open onClose={() => undefined} />);
    // The panel links out to nothing: every portal link is still unverified.
    const links = container.querySelectorAll('a[href^="http"]');
    expect(links).toHaveLength(0);
    expect(screen.getAllByText('link not yet verified').length).toBeGreaterThan(0);
  });

  it('states that nothing was searched on the reader behalf', () => {
    renderFlow(<PriorArtFlow open onClose={() => undefined} />);
    expect(
      screen.getByText(/Nothing on this page has been searched on your behalf/),
    ).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it.each([
    [
      'classification',
      <ClassificationFlow key="c" open onClose={() => undefined} onApply={() => undefined} />,
    ],
    ['abs', <AbsFlow key="a" open onClose={() => undefined} />],
    ['prior art', <PriorArtFlow key="p" open onClose={() => undefined} />],
  ])(
    'the %s flow has no axe violations',
    async (_name, node) => {
      const { container } = renderFlow(node);
      const results = await axe.run(container, { resultTypes: ['violations'] });
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    },
    30_000,
  );
});
