/**
 * The shell: six routes, one standing disclaimer, a language that switches and
 * sticks, and a mobile menu a keyboard user can get out of.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import App from '@/App';
import { i18n } from '@/i18n';
import { LOCALE_STORAGE_KEY } from '@/i18n/languages';

/**
 * Render, then wait for the footer to finish asking the API what the corpus is.
 * Without the wait that answer lands after the test body and React reports an
 * unwrapped update — noise that would eventually hide a real warning.
 */
async function renderAt(path: string) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText(/No sources indexed yet|unavailable right now/i);
  return result;
}

beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage('en');
  // The footer asks the API what the corpus is. Nothing here tests the network.
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

describe('routes', () => {
  it.each([
    ['/', 'Ancient knowledge.'],
    ['/sahayak', 'Sahayak'],
    ['/what-is-covered', "Understanding Ayurveda's IP and regulatory landscape"],
    ['/how-it-works', 'How a question becomes a cited answer'],
    ['/sources', 'What this is built on'],
    ['/about', 'About'],
  ])('%s renders its own heading', async (path, heading) => {
    await renderAt(path);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(heading);
  });

  it('an unknown address gets a real page, not a blank one', async () => {
    await renderAt('/no-such-page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('There is no page here');
    expect(screen.getByRole('link', { name: 'Go to the homepage' })).toBeInTheDocument();
  });

  it('gives each route a distinct document title', async () => {
    await renderAt('/sources');
    expect(document.title).toBe('Sources');
    await renderAt('/about');
    expect(document.title).toBe('About');
  });
});

describe('navigation', () => {
  it('offers six destinations, with no second level', async () => {
    await renderAt('/');
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Home',
      'Ask Sahayak',
      "What's covered",
      'How it works',
      'Sources',
      'About',
    ]);
  });

  it('marks the current page for assistive technology', async () => {
    await renderAt('/sources');
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Sources' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('the standing disclaimer', () => {
  it.each(['/', '/sahayak', '/sources'])('appears on %s', async (path) => {
    await renderAt(path);
    expect(screen.getByText(/does not provide legal advice/i)).toBeInTheDocument();
  });

  it('is not dismissible — there is no control to remove it', async () => {
    await renderAt('/');
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).queryAllByRole('button')).toHaveLength(0);
  });

  it('says there are no sources rather than reporting a count of zero', async () => {
    await renderAt('/');
    expect(await screen.findByText(/No sources indexed yet/)).toBeInTheDocument();
    expect(screen.queryByText(/0 documents/)).not.toBeInTheDocument();
  });

  it('says so when the source information cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await renderAt('/');
    expect(await screen.findByText(/unavailable right now/i)).toBeInTheDocument();
  });
});

describe('language', () => {
  it('switches the interface and remembers the choice', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    const selector = screen.getAllByRole('combobox', { name: 'Language' })[0]!;
    expect(selector).toHaveValue('en');

    await user.selectOptions(selector, 'te');

    expect(i18n.resolvedLanguage).toBe('te');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('te');
  });

  it('writes the active language onto <html>, so the right script is used', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    expect(document.documentElement.lang).toBe('en');

    await user.selectOptions(screen.getAllByRole('combobox', { name: 'Language' })[0]!, 'bn');
    expect(document.documentElement.lang).toBe('bn');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('lists every language in its own script', async () => {
    await renderAt('/');
    const selector = screen.getAllByRole('combobox', { name: 'Language' })[0]!;
    const options = within(selector).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'English',
      'हिंदी',
      'తెలుగు',
      'தமிழ்',
      'বাংলা',
      'मराठी',
    ]);
  });
});

describe('the mobile menu', () => {
  it('traps focus, closes on Escape, and gives focus back', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    const opener = screen.getByRole('button', { name: 'Menu' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getAllByRole('link')).not.toHaveLength(0);

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes itself when a link is followed', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    await user.click(within(dialog).getByRole('link', { name: 'Sources' }));

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What this is built on');
  });
});

describe('skip link', () => {
  it('is the first thing a keyboard user reaches', async () => {
    const user = userEvent.setup();
    await renderAt('/');
    await user.tab();
    expect(document.activeElement).toHaveTextContent('Skip to content');
    expect(document.querySelector('main')).toHaveAttribute('id', 'main');
  });
});

describe('accessibility of the shell', () => {
  it('has no axe violations on a rendered page', async () => {
    const { container } = await renderAt('/');
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);

  it('has no axe violations with the mobile menu open', async () => {
    const user = userEvent.setup();
    const { container } = await renderAt('/');
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});
