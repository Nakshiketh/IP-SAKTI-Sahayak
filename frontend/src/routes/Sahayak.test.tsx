/**
 * The workspace. Three things it has to get right:
 *
 *  - a first-time reader makes zero decisions before getting an answer
 *  - it opens as one column and reaches three only after an answer exists
 *  - changing jurisdiction swaps the answer set rather than widening it
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import Sahayak from '@/routes/Sahayak';
import { DEMO_ANSWERS } from '@/services/answers.mock';

/** jsdom has no matchMedia; the workspace changes behaviour by width. */
function setViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = min ? width >= Number(min[1]) : false;
    return {
      matches,
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

function renderAt(path = '/sahayak') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sahayak />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  setViewport(1440);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('zero decisions before the first answer', () => {
  it('opens with a question box and a default jurisdiction it states', () => {
    renderAt();
    expect(screen.getByLabelText('Your question')).toBeInTheDocument();

    const group = screen.getByRole('radiogroup', { name: 'Jurisdiction' });
    expect(within(group).getByRole('radio', { name: 'India' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Stated, not asked: the context line says what the answer will assume.
    expect(screen.getByRole('button', { name: 'India' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /product not yet identified/ })).toBeInTheDocument();
  });

  it('answers a typed question without anything else being set', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Your question'), 'Can we patent this?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByText('Can we patent this?')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Answer' })).toBeInTheDocument();
  });

  it('offers three starter questions, with the rest behind a disclosure', async () => {
    const user = userEvent.setup();
    renderAt();

    const before = screen.getAllByRole('button', { name: /\?$/ });
    expect(before).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'More examples' }));
    expect(screen.getAllByRole('button', { name: /\?$/ }).length).toBeGreaterThan(3);
  });

  it('runs a starter question straight into an answer', async () => {
    const user = userEvent.setup();
    renderAt();

    const starter = screen.getByRole('button', {
      name: 'What changes if we want to sell the same product in the UK?',
    });
    await user.click(starter);
    expect(screen.getByRole('heading', { name: 'Answer' })).toBeInTheDocument();
  });
});

describe('the layout reaches three columns, it does not start there', () => {
  it('is one column before an answer, even on a wide screen', () => {
    const { container } = renderAt();
    expect(container.querySelector('[data-layout]')).toHaveAttribute(
      'data-layout',
      'single-column',
    );
  });

  it('has no sources panel until an answer exists', () => {
    renderAt();
    expect(screen.queryByRole('heading', { name: /^Sources/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sources/ })).toBeNull();
  });

  it('becomes three columns once there is an answer at desktop width', () => {
    const { container } = renderAt('/sahayak?q=Can%20we%20patent%20this%3F');
    expect(container.querySelector('[data-layout]')).toHaveAttribute('data-layout', 'three-column');
    // Context rail present but collapsed.
    expect(screen.getByRole('button', { name: 'Show context' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('heading', { name: /^Sources/ })).toBeInTheDocument();
  });

  it('puts sources behind a counted control below desktop width', () => {
    setViewport(900);
    renderAt('/sahayak?q=Can%20we%20patent%20this%3F');

    const button = screen.getByRole('button', { name: /^Sources/ });
    expect(button).toHaveTextContent(String(DEMO_ANSWERS.IN.citations.length));
    expect(screen.queryByRole('button', { name: 'Show context' })).toBeNull();
  });

  it('opens sources in a dialog on a phone', async () => {
    const user = userEvent.setup();
    setViewport(360);
    renderAt('/sahayak?q=Can%20we%20patent%20this%3F');

    await user.click(screen.getByRole('button', { name: /^Sources/ }));
    const dialog = screen.getByRole('dialog', { name: 'Sources' });
    expect(within(dialog).getAllByRole('article')).toHaveLength(DEMO_ANSWERS.IN.citations.length);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('the jurisdiction toggle', () => {
  it('swaps the whole answer set rather than widening it', async () => {
    const user = userEvent.setup();
    renderAt('/sahayak?q=Can%20we%20sell%20this%20abroad%3F');

    expect(screen.getByRole('heading', { name: 'The Patents Act, 1970' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Traditional herbal registration scheme' }),
    ).toBeNull();

    const group = screen.getByRole('radiogroup', { name: 'Jurisdiction' });
    await user.click(within(group).getByRole('radio', { name: 'International' }));

    expect(
      screen.getByRole('heading', { name: 'Traditional herbal registration scheme' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'The Patents Act, 1970' })).toBeNull();
  });

  it('offers a market only once the jurisdiction is international', async () => {
    const user = userEvent.setup();
    renderAt();

    expect(screen.queryByRole('combobox', { name: 'Market' })).toBeNull();
    const group = screen.getByRole('radiogroup', { name: 'Jurisdiction' });
    await user.click(within(group).getByRole('radio', { name: 'International' }));
    expect(screen.getByRole('combobox', { name: 'Market' })).toBeInTheDocument();
  });
});

describe('language is detected, not asked for', () => {
  it('reads the script as the reader types, and shows it correctably', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Your question'), 'మా ఉత్పత్తి');
    // Once in the composer's indicator, once in the context line above it.
    expect(screen.getAllByText(/తెలుగు/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: 'change' })).toBeInTheDocument();
  });

  it('says which languages it is between when the script cannot decide', async () => {
    const user = userEvent.setup();
    renderAt();

    // Devanagari carries both Hindi and Marathi; the script cannot separate them.
    await user.type(screen.getByLabelText('Your question'), 'हमारे उत्पाद');
    expect(screen.getByText(/हिंदी \/ मराठी/)).toBeInTheDocument();
  });

  it('stops guessing once the reader has corrected it', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Your question'), 'हमारे उत्पाद');
    await user.click(screen.getByRole('button', { name: 'change' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /language/i }), 'mr');

    expect(screen.getByText(/Detected: मराठी/)).toBeInTheDocument();
  });
});

describe('keyboard', () => {
  it('focuses the composer on Ctrl+K from anywhere', async () => {
    const user = userEvent.setup();
    renderAt();

    const composer = screen.getByLabelText('Your question');
    expect(composer).not.toHaveFocus();
    await user.keyboard('{Control>}k{/Control}');
    expect(composer).toHaveFocus();
  });

  it('sends on Ctrl+Enter', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Your question'), 'A question');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(screen.getByRole('heading', { name: 'Answer' })).toBeInTheDocument();
  });

  it('opens the examples on / from an empty box, and not while typing', async () => {
    const user = userEvent.setup();
    renderAt();

    const composer = screen.getByLabelText('Your question');
    await user.click(composer);
    await user.keyboard('/');
    expect(screen.getByRole('button', { name: 'More examples' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // With text present, "/" is just a character.
    await user.type(composer, 'either/or');
    expect(composer).toHaveValue('either/or');
  });
});

describe('honesty', () => {
  it('says every question currently returns the same illustrative answer', () => {
    renderAt('/sahayak?q=anything');
    // The notice heading and the answer's own header badge.
    expect(
      screen.getAllByText('Illustrative example — demo sources, not a legal source'),
    ).toHaveLength(2);
    expect(screen.getByText(/every question shows this example/)).toBeInTheDocument();
  });

  it('carries the not-legal-advice pill', () => {
    renderAt();
    expect(screen.getByText('Information, not legal advice')).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has no axe violations before an answer', async () => {
    const { container } = renderAt();
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);

  it('has no axe violations with an answer showing', async () => {
    const { container } = renderAt('/sahayak?q=Can%20we%20patent%20this%3F');
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});
