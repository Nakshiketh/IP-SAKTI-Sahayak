/**
 * The product check, walked through the way a reader walks it: validation that
 * stops a step, the four questions, the checks running, the result and the
 * routes.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Assessment from '@/routes/Assessment';

// A factory rather than a promise: a rejection created before anything awaits
// it is reported as unhandled.
function stubRecords(response: () => Promise<unknown>) {
  const fetchMock = vi.fn(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const EMPTY_STORE = () =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ records: [], total: 0, recordCount: 0, ingested: false, note: '' }),
  } as Response);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/assess']}>
      <Assessment />
    </MemoryRouter>,
  );
}

async function fillToProtection(user: ReturnType<typeof userEvent.setup>, ingredients: string[]) {
  await user.click(screen.getByRole('radio', { name: /Hair-related product/ }));
  await user.click(screen.getByRole('button', { name: /Continue/ }));

  await user.type(screen.getByLabelText(/Product or brand name/), 'Keshamrit Hair Oil');
  await user.type(screen.getByLabelText(/What it is for/), 'Reduces hair fall');
  await user.click(screen.getByRole('button', { name: /Continue/ }));

  for (const ingredient of ingredients) {
    await user.type(screen.getByLabelText('Ingredient'), ingredient);
    await user.click(screen.getByRole('button', { name: 'Add' }));
  }
  await user.click(screen.getByRole('checkbox', { name: /Nothing new/ }));
  await user.click(screen.getByRole('button', { name: /Continue/ }));

  await user.click(within(screen.getByRole('group', { name: /brand name or logo/ })).getByRole('radio', { name: 'Yes' }));
  await user.click(within(screen.getByRole('group', { name: /already made the formulation public/ })).getByRole('radio', { name: 'No' }));
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the product check', () => {
  it('will not move on without a category, and says why', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Continue/ }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Check these before you continue');
    expect(within(alert).getByRole('link', { name: /Choose one option/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /What type of product/ })).toBeInTheDocument();
  });

  it('finds a classical formulation from its ingredients and says it is prior art', async () => {
    const user = userEvent.setup();
    const fetchMock = stubRecords(EMPTY_STORE);
    renderPage();

    await fillToProtection(user, ['Haritaki', 'Bibhitaki', 'Amla']);
    await user.click(screen.getByRole('button', { name: /Run the assessment/ }));

    expect(
      await screen.findByRole('heading', { name: /Potentially similar existing IP or prior art found/ }, { timeout: 3000 }),
    ).toBeInTheDocument();
    // The empty store is reported as empty, not as a clean search.
    expect(screen.getByText(/none are loaded in this portal yet/)).toBeInTheDocument();

    // Only search words leave the page — never the formulation field.
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('match_any=true');

    await user.click(screen.getByRole('button', { name: /See recommended protection/ }));
    expect(screen.getByRole('heading', { name: 'Recommended protection' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trade mark' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Guidance, not legal advice/, { selector: 'h3' })).toBeInTheDocument();
  });

  it('says nothing similar was identified without calling it clear, and survives a failed search', async () => {
    const user = userEvent.setup();
    stubRecords(() => Promise.reject(new Error('offline')));
    renderPage();

    await fillToProtection(user, ['Rosemary']);
    await user.click(screen.getByRole('button', { name: /Run the assessment/ }));

    expect(
      await screen.findByRole('heading', { name: /No similar result identified/ }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not mean the invention is legally new/)).toBeInTheDocument();
    expect(screen.getByText(/could not be reached/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What should I do next?' })).toBeInTheDocument();
  });
});
