/**
 * The video behind every page: one element, kept across tabs, with sound that
 * starts on and a control in the corner that turns it off.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { i18n } from '@/i18n';
import { signInForTest } from '@/test/signedIn';

/** Render, then wait for the page and the footer's corpus line to settle. */
async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText(/^v[\d.]|unavailable right now/i);
  return (await screen.findAllByRole('heading', { level: 1 }))[0]!;
}

beforeEach(async () => {
  sessionStorage.clear();
  await i18n.changeLanguage('en');
  signInForTest();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ corpus_version: '0.0.0-unbuilt', document_count: 0, as_of_date: null }),
      } as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the background video', () => {
  it('plays the site video on a loop behind the page', async () => {
    await renderAt('/');
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.loop).toBe(true);
    expect(video!.querySelector('source')?.getAttribute('src')).toBe('/assets/app-background.mp4');
  });

  it('is the same element on every tab, so moving between them never restarts it', async () => {
    const user = userEvent.setup();
    const homeHeading = (await renderAt('/')).textContent ?? '';
    const before = document.querySelector('video');

    await user.click(document.querySelector<HTMLAnchorElement>('a[href="/sources"]')!);
    await waitFor(
      () =>
        expect(screen.getAllByRole('heading', { level: 1 })[0]).not.toHaveTextContent(homeHeading),
      { timeout: 5000 },
    );

    expect(document.querySelectorAll('video')).toHaveLength(1);
    expect(document.querySelector('video')).toBe(before);
  });

  it('starts with sound, and the corner control turns it off for the rest of the tab', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    await user.click(await screen.findByRole('button', { name: 'Mute background video' }));
    await screen.findByRole('button', { name: 'Unmute background video' });

    expect(document.querySelector('video')!.muted).toBe(true);
    expect(sessionStorage.getItem('sahayak.backdrop.muted')).toBe('true');
  });
});
