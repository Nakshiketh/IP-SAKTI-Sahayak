/**
 * The dashboard, and the two ways a usage page lies.
 *
 * It shows a rate it has no data for, and it hides small counts without saying
 * it hid them. Both are pinned here, along with the refusals — which have to
 * stay distinguishable, because "switched off", "not an administrator" and "the
 * server is down" send whoever is reading to three different files.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Insights from '@/routes/Insights';
import { signInForTest, signOutForTest } from '@/test/signedIn';

function renderPage() {
  return render(
    <MemoryRouter>
      <Insights />
    </MemoryRouter>,
  );
}

const FULL = {
  total_queries: 12,
  by_jurisdiction: [{ name: 'IN', count: 9 }],
  by_language: [{ name: 'en', count: 12 }],
  by_abstain_reason: [],
  most_used_sources: [{ name: 'in-patents-act-1970', count: 7 }],
  knowledge_gaps: [{ reason: 'unsupported_jurisdiction', count: 6 }],
  suppressed_buckets: 2,
  minimum_bucket: 5,
  abstention_rate: 0.25,
  escalation_rate: 0.1,
  refusal_rate: 0,
  latency_p50_ms: 20,
  latency_p95_ms: 41,
  provenance: 'Local / demo data',
};

function answer(status: number, body?: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          resolve(
            new Response(body === undefined ? '' : JSON.stringify(body), {
              status,
              headers: { 'Content-Type': 'application/json' },
            }),
          ),
        ),
    ),
  );
}

beforeEach(() => signInForTest());
afterEach(() => {
  vi.unstubAllGlobals();
  signOutForTest();
});

describe('the insight dashboard', () => {
  it('says how many categories it withheld, rather than hiding them silently', async () => {
    answer(200, FULL);
    renderPage();

    // The number matters as much as the fact: a reader adding the columns up
    // needs to know they will not reach the total, and why.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /counts are withheld/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/fewer than 5/i)).toBeInTheDocument();
    expect(screen.getByText(/2 categor/i)).toBeInTheDocument();
  });

  it('shows a dash rather than 0% when nothing has been asked', async () => {
    answer(200, { ...FULL, total_queries: 0, abstention_rate: null });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nobody has asked anything/i)).toBeInTheDocument());
    // 0% would be a figure invented out of an empty table.
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('never renders a question, because it is never sent one', async () => {
    answer(200, FULL);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Local / demo data'));
    expect(container.textContent?.toLowerCase()).not.toContain('ashwagandha');
  });

  it('names the reason a gap exists rather than guessing the topic', async () => {
    answer(200, FULL);
    const { container } = renderPage();
    // The count sits in its own <span>, so the row's text is split across
    // elements and getByText would not see it whole.
    await waitFor(() => expect(container.textContent).toContain('unsupported_jurisdiction'));
  });

  it('tells an administrator the feature is off, not that it broke', async () => {
    answer(404);
    renderPage();
    await waitFor(() => expect(screen.getByText(/switched off/i)).toBeInTheDocument());
  });

  it('distinguishes a signed-in non-administrator from a failure', async () => {
    answer(403);
    renderPage();
    await waitFor(() => expect(screen.getByText(/not an administrator/i)).toBeInTheDocument());
  });

  it('shows nothing rather than a stale figure when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderPage();

    await waitFor(() => expect(screen.getByText(/could not reach/i)).toBeInTheDocument());
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });
});
