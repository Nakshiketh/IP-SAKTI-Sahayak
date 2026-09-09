/**
 * The engineering page, and the rule that matters most on it: nothing may claim
 * a capability the code does not have.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PIPELINE_STAGES } from '@/components/howitworks/pipelineStages';
import HowItWorks, { METRICS } from '@/routes/HowItWorks';

function renderPage() {
  return render(
    <MemoryRouter>
      <HowItWorks />
    </MemoryRouter>,
  );
}

/** Wait for the evaluation summary fetch to settle before asserting. */
async function renderSettled() {
  const result = renderPage();
  await screen.findByText(/No evaluation has been run|Last run/);
  return result;
}

beforeEach(() => {
  // Nothing writes evals-summary.json yet, so the real page 404s. Modelled here.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('honesty about what is built', () => {
  it('separates a stage that is finished from one running on illustrative data', async () => {
    await renderSettled();
    // Reading the question, choosing a namespace and rendering do not depend on
    // the corpus, so they are as real as they will get. Everything from
    // retrieval to the abstention decision runs in full but over the fixture
    // store. Translation has an interface and nothing behind it.
    const by = (state: string) => PIPELINE_STAGES.filter((stage) => stage.state === state);
    expect(by('live').map((stage) => stage.id)).toEqual([
      'detect',
      'understand',
      'clarify',
      'route',
      'render',
    ]);
    expect(by('planned').map((stage) => stage.id)).toEqual(['translate']);
    expect(by('demo')).toHaveLength(7);
  });

  it('shows the selected stage its build state', async () => {
    await renderSettled();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('running')).toBeInTheDocument();
  });

  it('says up front what runs and what it runs over', async () => {
    await renderSettled();
    expect(screen.getByText('What is actually built')).toBeInTheDocument();
    expect(screen.getByText(/no document has been ingested/i)).toBeInTheDocument();
  });

  it('reports no evaluation numbers, because none have been produced', async () => {
    await renderSettled();
    expect(screen.getByText('No evaluation has been run')).toBeInTheDocument();
    // Every metric row shows an absent result rather than a figure. Counted off
    // METRICS rather than hard-coded, so adding a metric does not silently stop
    // this checking every row.
    expect(screen.getAllByText('not measured')).toHaveLength(METRICS.length);
  });

  it('never shows a figure without saying what it was measured against', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              run_at: '2026-01-15',
              case_count: 170,
              caveat: 'Measured against a demonstration corpus of 9 illustrative documents.',
              metrics: { abstention_precision: '33.6%' },
            }),
        } as Response),
      ),
    );
    renderPage();

    expect(
      await screen.findByText(/demonstration corpus of 9 illustrative documents/),
    ).toBeVisible();
    expect(screen.getByText('What these numbers were measured against')).toBeInTheDocument();
    expect(screen.getByText('170 cases', { exact: false })).toBeInTheDocument();
  });

  it('shows real numbers when a summary exists, without changing the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              run_at: '2026-01-15',
              case_count: 170,
              caveat: 'Measured against a demonstration corpus.',
              metrics: { jurisdiction_purity: '100%', latency_p50: '2.4s' },
            }),
        } as Response),
      ),
    );
    renderPage();

    // The run date shares its paragraph with the case count, so an exact
    // match would only pass on a summary that carried no case_count.
    expect(await screen.findByText('Last run 2026-01-15', { exact: false })).toBeInTheDocument();
    // Scoped to the row: "100%" is also the *target* for two metrics, and an
    // unscoped match would pass whether or not the result was rendered at all.
    const purityRow = screen.getByRole('rowheader', { name: 'Jurisdiction purity' }).closest('tr')!;
    expect(within(purityRow).getAllByText('100%')).toHaveLength(2);
    expect(screen.getByText('2.4s')).toBeInTheDocument();
    // Every metric the run did not report still says so.
    expect(screen.getAllByText('not measured')).toHaveLength(METRICS.length - 2);
  });

  it('treats a malformed summary as no summary, rather than crashing', async () => {
    // This is not hypothetical: a stubbed fetch returning a different endpoint's
    // JSON took the whole page down, and a misrouted proxy would do the same.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ corpus_version: '0.0.0-unbuilt', document_count: 0 }),
        } as Response),
      ),
    );
    renderPage();

    expect(await screen.findByText('No evaluation has been run')).toBeInTheDocument();
    expect(screen.getAllByText('not measured')).toHaveLength(METRICS.length);
  });

  it('states plainly that retrieval does not eliminate hallucination', async () => {
    await renderSettled();
    expect(screen.getByText(/It does not eliminate it/)).toBeInTheDocument();
  });

  it('names what is not scheduled, rather than implying it is coming', async () => {
    await renderSettled();
    expect(screen.getByText('Not scheduled')).toBeInTheDocument();
    expect(screen.getByText(/directions, not commitments/i)).toBeInTheDocument();
  });
});

describe('the pipeline diagram', () => {
  it('advances on selection and keeps one stop in the tab order', async () => {
    const user = userEvent.setup();
    await renderSettled();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(13);
    expect(tabs.filter((tab) => tab.getAttribute('tabindex') === '0')).toHaveLength(1);

    await user.click(tabs[0]!);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveFocus();

    await user.keyboard('{End}');
    expect(tabs[12]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('never advances on its own', async () => {
    vi.useFakeTimers();
    try {
      renderPage();
      const first = screen.getAllByRole('tab')[0]!;
      expect(first).toHaveAttribute('aria-selected', 'true');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives every stage all three fields of real copy', async () => {
    const user = userEvent.setup();
    await renderSettled();
    const tabs = screen.getAllByRole('tab');

    for (let i = 0; i < tabs.length; i += 1) {
      await user.click(tabs[i]!);
      const panel = screen.getByRole('tabpanel');
      for (const label of ['What it does', 'What it hands on', 'When it fails']) {
        const term = within(panel).getByText(label);
        const value = term.nextElementSibling;
        expect(value?.textContent?.length ?? 0, `${label} on stage ${i + 1}`).toBeGreaterThan(40);
      }
    }
  }, 40_000);

  it('associates the panel with the selected stage', async () => {
    await renderSettled();
    const panel = screen.getByRole('tabpanel');
    const labelledBy = panel.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveAttribute('role', 'tab');
  });
});

describe('abstention', () => {
  it('shows all five states, each with what the reader is offered next', async () => {
    await renderSettled();
    for (const title of [
      'Nothing relevant found',
      'Outside what this covers',
      'The sources disagree',
      'The sources may be out of date',
      'It depends on facts you have not given',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getAllByText('What you are offered:')).toHaveLength(5);
  });
});

describe('jurisdictions', () => {
  it('shows the two answers side by side and says they were produced separately', async () => {
    await renderSettled();
    expect(screen.getByText('Under India')).toBeInTheDocument();
    expect(screen.getByText('Under the United Kingdom')).toBeInTheDocument();
    expect(screen.getByText(/Nothing in the product merges them/)).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('resolves every in-page link', async () => {
    const { container } = await renderSettled();
    const nav = screen.getByRole('navigation', { name: 'The pipeline' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(6);
    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      expect(container.querySelector(href), `no target for ${href}`).toBeTruthy();
    }
  });
});

describe('accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = await renderSettled();
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});
