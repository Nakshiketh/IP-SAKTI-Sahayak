/**
 * The workspace. Three things it has to get right:
 *
 *  - a first-time reader makes zero decisions before getting an answer
 *  - it opens as one column and reaches three only after an answer exists
 *  - changing jurisdiction swaps the answer set rather than widening it
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import sahayakCopy from '@/locales/en/sahayak.json';
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

/**
 * Asking is a request, so a render that carries a question has to settle before
 * anything is asserted. The three markers are the workspace's terminal states.
 */
async function settled() {
  await waitFor(() =>
    expect(
      document.querySelector('[data-answered], [data-abstained], [data-failed]'),
    ).not.toBeNull(),
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  setViewport(1440);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a flow named in the address', () => {
  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search}</div>;
  }

  it('opens the prior-art tool straight away, before any question is asked', () => {
    renderAt('/sahayak?flow=priorArt');
    expect(screen.getByRole('dialog', { name: sahayakCopy.flows.priorArt.title })).toBeVisible();
  });

  it('opens the classification tool the same way', () => {
    renderAt('/sahayak?flow=classify');
    expect(screen.getByRole('dialog', { name: sahayakCopy.flows.classify.title })).toBeVisible();
  });

  it('ignores a flow it does not have rather than opening an empty panel', () => {
    renderAt('/sahayak?flow=noveltyVerdict');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes the flow out of the address when it is closed, so a reload does not reopen it', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sahayak?flow=priorArt']}>
        <Sahayak />
        <LocationProbe />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('drawer-scrim'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/sahayak$/);
  });
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
    // The status lines run first; the answer follows them.
    expect(await screen.findByRole('heading', { name: 'Answer' })).toBeInTheDocument();
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
      name: 'How do we file one international patent application for several countries?',
    });
    await user.click(starter);
    expect(await screen.findByRole('heading', { name: 'Answer' })).toBeInTheDocument();
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
    expect(screen.queryByRole('tab', { name: /^Sources/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sources/ })).toBeNull();
  });

  it('becomes three columns once there is an answer at desktop width', async () => {
    const { container } = renderAt('/sahayak?q=Can%20we%20patent%20this%3F');
    await settled();
    expect(container.querySelector('[data-layout]')).toHaveAttribute('data-layout', 'three-column');
    // Context rail present but collapsed.
    expect(screen.getByRole('button', { name: 'Show context' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // Sources and related records are tabs in the panel, never one list.
    expect(screen.getByRole('tab', { name: /^Sources/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Related records/ })).toBeInTheDocument();
  });

  it('puts sources behind a counted control below desktop width', async () => {
    setViewport(900);
    renderAt('/sahayak?q=Can%20we%20patent%20this%3F');
    await settled();

    // The count covers everything behind the control: sources and records both.
    const button = screen.getByRole('button', { name: /^Sources/ });
    expect(button.textContent).toMatch(/\d/);
    expect(screen.queryByRole('button', { name: 'Show context' })).toBeNull();
  });

  it('opens sources in a dialog on a phone', async () => {
    const user = userEvent.setup();
    setViewport(360);
    renderAt('/sahayak?q=Can%20we%20patent%20this%3F');
    await settled();

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
    await settled();

    expect(screen.getByRole('heading', { name: 'The Patents Act, 1970' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Traditional herbal registration scheme' }),
    ).toBeNull();

    const group = screen.getByRole('radiogroup', { name: 'Jurisdiction' });
    await user.click(within(group).getByRole('radio', { name: 'International' }));

    expect(
      await screen.findByRole('heading', { name: 'Traditional herbal registration scheme' }),
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
    expect(await screen.findByRole('heading', { name: 'Answer' })).toBeInTheDocument();
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
  it('carries a source note under the answer, once', async () => {
    renderAt('/sahayak?q=anything');
    await settled();
    // Stated once, under the answer it qualifies — not as a banner above it and
    // not repeated on every source card.
    expect(screen.getAllByText(/Check the official text before you rely/i)).toHaveLength(1);
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
