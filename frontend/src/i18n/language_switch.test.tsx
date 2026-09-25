import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import App from '@/App';
import { signInForTest } from '@/test/signedIn';
import { i18n } from '@/i18n';

/**
 * Open the language selector and pick a language by its code.
 *
 * The selector is now a custom dropdown rather than a native <select>, so
 * we click the trigger button to open the panel and then click the language
 * option inside it.
 */
async function switchLanguage(user: ReturnType<typeof userEvent.setup>, langCode: string) {
  // Open the language selector dropdown
  const triggers = screen.getAllByRole('button', { name: 'Language' });
  const trigger = triggers[0]!;
  await user.click(trigger);

  // Find the option by its lang attribute and click it
  const options = screen.getAllByRole('option');
  const target = options.find((opt) => opt.getAttribute('lang') === langCode);
  if (!target) throw new Error(`Language option for "${langCode}" not found`);
  await user.click(target);
}

describe('Language switching in UI', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('en');
    // Every route sits behind the front door now. These suites are about what
    // the pages render, not about getting through it.
    signInForTest();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              corpus_version: '0.0.0-unbuilt',
              document_count: 0,
              as_of_date: null,
            }),
        } as Response),
      ),
    );
  });

  it('switches the Sources page to Tamil and renders Tamil headings and text', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sources']}>
        <App />
      </MemoryRouter>,
    );

    // Initial English heading
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent(
      'What this is built on',
    );

    await switchLanguage(user, 'ta');

    // Heading should change to Tamil
    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          'இது எதன் அடிப்படையில் கட்டமைக்கப்பட்டுள்ளது',
        );
      },
      { timeout: 5000 },
    );

    // Subtitle in Tamil
    expect(
      screen.getByText(/ஒவ்வொரு பதிலும் இந்த ஆதாரங்களில் இருந்தே வருகின்றன/),
    ).toBeInTheDocument();
  });

  it('switches the Sources page to Hindi and renders Hindi headings and text', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sources']}>
        <App />
      </MemoryRouter>,
    );

    // Wait for page to load
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent(
      'What this is built on',
    );

    await switchLanguage(user, 'hi');

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('यह किस पर आधारित है');
      },
      { timeout: 5000 },
    );

    expect(screen.getByText(/प्रत्येक उत्तर इन्हीं स्रोतों से आता है/)).toBeInTheDocument();
  });

  it('switches to Telugu and renders Telugu text', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sources']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent(
      'What this is built on',
    );

    await switchLanguage(user, 'te');

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          'ఇది దేనిపై నిర్మించబడింది',
        );
      },
      { timeout: 5000 },
    );
  });

  it('switches to Bengali and renders Bengali text', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sources']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent(
      'What this is built on',
    );

    await switchLanguage(user, 'bn');

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          'এটি কিসের উপর ভিত্তি করে তৈরি',
        );
      },
      { timeout: 5000 },
    );
  });

  it('switches to Marathi and renders Marathi text', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sources']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).toHaveTextContent(
      'What this is built on',
    );

    await switchLanguage(user, 'mr');

    await waitFor(
      () => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
          'हे कशावर आधारलेले आहे',
        );
      },
      { timeout: 5000 },
    );
  });
});
