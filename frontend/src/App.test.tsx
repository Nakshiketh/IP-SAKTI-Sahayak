/**
 * The shell: six routes, one standing disclaimer, a language that switches and
 * sticks, and a mobile menu a keyboard user can get out of.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import App from '@/App';
import { signInForTest } from '@/test/signedIn';
import { i18n } from '@/i18n';
import { LOCALE_STORAGE_KEY } from '@/i18n/languages';

/**
 * Render, then wait for the page to actually be there.
 *
 * Two waits, for two different reasons. The footer asks the API what the corpus
 * is, and without the wait that answer lands after the test body and React
 * reports an unwrapped update — noise that would eventually hide a real warning.
 * And every route but the homepage and the 404 arrives as its own chunk, so
 * asserting straight after `render` would assert against the Suspense fallback.
 * Waiting for the heading is what makes these tests describe a page a reader
 * sees rather than a frame around one.
 */
async function renderAt(path: string) {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  // The footer's source line settles last. With no corpus indexed it carries
  // just the version, so that is what marks the page as ready.
  await screen.findByText(/^v[\d.]|unavailable right now/i);
  // `findAll`, because a test that renders twice to compare two pages leaves
  // both in the document, and `findBy` would throw on the second call.
  await screen.findAllByRole('heading', { level: 1 });
  return result;
}

beforeEach(async () => {
  window.localStorage.clear();
  await i18n.changeLanguage('en');
  // Every route sits behind the front door now. These suites are about what
  // the pages render, not about getting through it.
  signInForTest();
  // The footer asks the API what the corpus is. Nothing here tests the network.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/v1/analyst/status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              engine: 'rules',
              products: { count: 0, retrieved_at: '' },
              records: { available: false, count: 0 },
              traditional_reference: 0,
            }),
        } as Response);
      }
      if (url.includes('/api/v1/analyst/conversations')) {
        const isPost = init?.method === 'POST';
        const emptyConv = {
          id: 'c1',
          title: 'New invention',
          created_at: 1,
          updated_at: 1,
          invention: {
            title: null,
            invention_type: null,
            form: null,
            category: null,
            intended_use: null,
            use_terms: [],
            problem: null,
            ingredients: [],
            batch_size: null,
            process_steps: [],
            process_parameters: [],
            distinctive_features: [],
            technical_effects: [],
            evidence: null,
            disclosure: null,
            brand_name: null,
            packaging_note: null,
            region_note: null,
            version: 0,
          },
          messages: [],
          analysis: null,
          missing: [],
          ready: false,
          history: [],
          engine: 'rules',
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(isPost ? emptyConv : []),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ corpus_version: '0.0.0-unbuilt', document_count: 0, as_of_date: null }),
      } as Response);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('routes', () => {
  it.each([
    ['/', 'Ancient knowledge.'],
    ['/sahayak', 'Sahayak'],
    ['/assess', 'Analyse my invention'],
    ['/assess/steps', 'Check my product'],
    ['/what-is-covered', "Understanding Ayurveda's IP and regulatory landscape"],
    ['/how-it-works', 'How a question becomes a cited answer'],
    ['/sources', 'What this is built on'],
    ['/about', 'About'],
    ['/privacy', 'What this product stores'],
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

  it('reports no count at all rather than a count of zero', async () => {
    await renderAt('/');
    expect(await screen.findByText(/^v[\d.]/)).toBeInTheDocument();
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
  /**
   * Helper to open the language dropdown and pick a language by code.
   * The selector is now a custom dropdown rather than a native <select>.
   */
  async function switchLang(user: ReturnType<typeof userEvent.setup>, langCode: string) {
    // Found by its popup role, not by its accessible name. The name is
    // "Language" only while the interface is in English — once the shell is
    // translated it is "اللغة" or "भाषा", and a test that looked for the
    // English word could never switch twice.
    const triggers = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-haspopup') === 'listbox');
    await user.click(triggers[0]!);
    const options = screen.getAllByRole('option');
    const target = options.find((opt) => opt.getAttribute('lang') === langCode);
    if (!target) throw new Error(`Language option for "${langCode}" not found`);
    await user.click(target);
  }

  it('switches the interface and remembers the choice', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    await switchLang(user, 'te');

    // The switch waits for that language's files to arrive before it happens.
    // Switching first would show a screen of raw dotted keys for as long as the
    // fetch took, which is worse than a moment on the language already showing.
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('te'));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('te');
  });

  it('writes the active language onto <html>, so the right script is used', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    expect(document.documentElement.lang).toBe('en');

    await switchLang(user, 'bn');
    await waitFor(() => expect(document.documentElement.lang).toBe('bn'));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('turns the whole interface round for Arabic, and back again', async () => {
    // The first right-to-left language in the product. `dir` was carried per
    // locale from the beginning for exactly this moment, so what matters is
    // that it reaches <html> — and, just as much, that leaving Arabic puts it
    // back. A direction that sticks would mirror every later page silently.
    const user = userEvent.setup();
    await renderAt('/');

    await switchLang(user, 'ar');
    await waitFor(() => expect(document.documentElement.lang).toBe('ar'));
    expect(document.documentElement.dir).toBe('rtl');

    await switchLang(user, 'hi');
    await waitFor(() => expect(document.documentElement.lang).toBe('hi'));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('lists languages when the dropdown opens', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    // Open the language dropdown
    const trigger = screen.getAllByRole('button', { name: 'Language' })[0]!;
    await user.click(trigger);

    // Should have option elements for all languages
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(67);
  });

  it('lists the languages A to Z, with no group headings', async () => {
    const user = userEvent.setup();
    await renderAt('/');

    const trigger = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-haspopup') === 'listbox')[0]!;
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Select language' });
    // The grouping is gone: with sixty-seven entries and a search box, "which
    // group is mine in" is not the question, and A to Z needs no explaining.
    expect(within(dialog).queryByText('Indian languages')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('International')).not.toBeInTheDocument();

    const names = within(dialog)
      .getAllByRole('option')
      .map((option) => option.getAttribute('data-english') ?? option.textContent ?? '');
    expect(names[0]).toMatch(/Albanian/);
    expect(names[names.length - 1]).toMatch(/Vietnamese/);
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
