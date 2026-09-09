/**
 * The privacy page, and the one property that matters about it: nothing on it
 * is a sentence somebody typed and forgot.
 *
 * The claims that can drift — which sources need consent, what a stored row
 * holds, whether the deletion path does anything — are asserted against the
 * things that would make them false, not against the copy that states them.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsentDialog } from '@/components/privacy/ConsentDialog';
import privacy from '@/locales/en/privacy.json';
import Privacy from '@/routes/Privacy';
import { sessionId } from '@/services/session';

function renderPage() {
  return render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  );
}

const SOURCE = {
  document_id: 'a-subscription-register',
  title: 'A Subscription Register',
  short_title: 'The Register',
  organization: 'A Publisher',
  jurisdiction: 'INTL',
};

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('what it says is stored', () => {
  it('lists every field it claims to keep, with a reason for each', () => {
    renderPage();

    for (const key of ['sessionId', 'questionHash', 'passages', 'versions', 'outcome'] as const) {
      expect(screen.getByText(privacy.stored[key])).toBeInTheDocument();
      // A row naming a field and not saying why it is there is the shape of a
      // policy document, which is what this page is trying not to be.
      expect(screen.getByText(privacy.stored[`${key}Why`])).toBeInTheDocument();
    }
  });

  it('says the question text, the note and the address are not columns', () => {
    renderPage();
    expect(screen.getByText(privacy.notStored.question)).toBeInTheDocument();
    expect(screen.getByText(privacy.notStored.note)).toBeInTheDocument();
    expect(screen.getByText(privacy.notStored.ip)).toBeInTheDocument();
    expect(screen.getByText(privacy.notStored.credentials)).toBeInTheDocument();
  });

  it('names the hosted model as the one case where text leaves the machine', () => {
    // The honest exception. A page claiming nothing ever leaves would be false
    // on any deployment that configures a generator.
    renderPage();
    expect(screen.getByText(privacy.sharing.model)).toBeInTheDocument();
  });
});

describe('the deletion path', () => {
  it('actually discards the session id, rather than saying it did', async () => {
    const before = sessionId();
    expect(window.sessionStorage.getItem('sahayak.session')).toBe(before);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: privacy.deletion.action }));

    expect(window.sessionStorage.getItem('sahayak.session')).toBeNull();
    expect(screen.getByText(privacy.deletion.done)).toBeInTheDocument();
    // The next question starts a session with no history.
    expect(sessionId()).not.toBe(before);
  });

  it('keeps the language choice, which is a preference and not a record', async () => {
    window.localStorage.setItem('sahayak.language', 'hi');
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: privacy.deletion.action }));
    expect(window.localStorage.getItem('sahayak.language')).toBe('hi');
  });
});

describe('the access log', () => {
  it('says no source needs credentials when the manifest names none', async () => {
    renderPage();
    expect(await screen.findByText(privacy.consent.none)).toBeInTheDocument();
    expect(screen.getByText(privacy.log.empty)).toBeInTheDocument();
  });

  it('shows a grant and its withdrawal, with the times the server recorded', async () => {
    vi.stubEnv('VITE_SAHAYAK_API', 'live');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              events: [
                {
                  sourceId: 'a-subscription-register',
                  sourceName: 'The Register',
                  granted: false,
                  recordedAt: '2026-03-04T11:02:00+00:00',
                },
                {
                  sourceId: 'a-subscription-register',
                  sourceName: 'The Register',
                  granted: true,
                  recordedAt: '2026-03-04T09:15:00+00:00',
                },
              ],
              granted: [],
              credentialedSources: [SOURCE],
            }),
        } as Response),
      ),
    );

    renderPage();

    // Both rows, not just the current state. A reader looking at this is most
    // often looking for the grant they have since withdrawn.
    expect(await screen.findByText('2026-03-04T09:15:00+00:00')).toBeInTheDocument();
    expect(screen.getByText('2026-03-04T11:02:00+00:00')).toBeInTheDocument();
    expect(screen.getByText(privacy.log.granted)).toBeInTheDocument();
    expect(screen.getByText(privacy.log.withdrawn)).toBeInTheDocument();

    // Consent stands withdrawn, so the source is offered again rather than
    // showing a withdraw button for something that is not allowed.
    expect(
      screen.getByRole('button', { name: /Use my access to The Register/ }),
    ).toBeInTheDocument();
  });

  it('counts the sources that would need consent, from the manifest', async () => {
    vi.stubEnv('VITE_SAHAYAK_API', 'live');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ events: [], granted: [], credentialedSources: [SOURCE] }),
        } as Response),
      ),
    );

    renderPage();

    // The "none need your credentials" sentence must stop being shown the
    // moment one is added, rather than staying because nobody remembered it.
    expect(await screen.findByText(SOURCE.title)).toBeInTheDocument();
    expect(screen.queryByText(privacy.consent.none)).not.toBeInTheDocument();
  });

  it('says nothing rather than guessing when the log cannot be reached', async () => {
    vi.stubEnv('VITE_SAHAYAK_API', 'live');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    renderPage();

    expect(await screen.findByText(privacy.log.unavailable)).toBeInTheDocument();
    expect(screen.queryByText(privacy.consent.none)).not.toBeInTheDocument();
  });
});

describe('the consent dialog', () => {
  function renderDialog(onRecorded = vi.fn(), onClose = vi.fn()) {
    render(
      <MemoryRouter>
        <ConsentDialog source={SOURCE} open={true} onClose={onClose} onRecorded={onRecorded} />
      </MemoryRouter>,
    );
    return { onRecorded, onClose };
  }

  it('names the source and its publisher, never "a subscription source"', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    // The name appears in the title, the body, the scope line and the button.
    // All four are deliberate: a reader who reads only one of them still knows
    // which source this is about.
    expect(within(dialog).getAllByText(/The Register/).length).toBeGreaterThan(1);
    expect(within(dialog).getByText(/A Publisher/)).toBeInTheDocument();
  });

  it('states whose credentials are used and that this product never holds them', () => {
    renderDialog();
    expect(screen.getByText(privacy.consent.dialogHolds)).toBeInTheDocument();
  });

  it('states the limit of what is being agreed to, and that it is logged', () => {
    renderDialog();
    expect(
      screen.getByText(privacy.consent.dialogScope.replace('{{source}}', 'The Register')),
    ).toBeInTheDocument();
    expect(screen.getByText(privacy.consent.dialogLogged)).toBeInTheDocument();
  });

  it('requires an action: closing it agrees to nothing', async () => {
    const { onRecorded, onClose } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: privacy.consent.cancel }));
    expect(onClose).toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('does not report a grant the server refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ code: 'unknown_source', message: 'no such source' }),
        } as Response),
      ),
    );
    const { onRecorded, onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /Use my access to The Register/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(privacy.consent.failed),
    );
    expect(onRecorded).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderPage();
    await screen.findByText(privacy.consent.none);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('the consent dialog is a dialog, labelled and modal', () => {
    render(
      <MemoryRouter>
        <ConsentDialog source={SOURCE} open={true} onClose={vi.fn()} onRecorded={vi.fn()} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();
  });
});
