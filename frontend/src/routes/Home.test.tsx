/**
 * The homepage, and the one path through the middle: type a question, get an
 * answer with sources, open a source.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/routes/Home';
import Sahayak from '@/routes/Sahayak';
import { DEMO_ANSWERS, demoCitationsFor } from '@/services/answers.mock';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sahayak" element={<Sahayak />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

describe('the hero', () => {
  it('carries the question the reader typed into the workspace', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Your question'), 'Can we register our brand name?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sahayak?q=Can%20we%20register%20our%20brand%20name%3F',
    );
    expect(screen.getByText('Can we register our brand name?')).toBeInTheDocument();
  });

  it('does nothing on an empty question rather than navigating to a blank answer', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('describes the drawn composition for a reader who cannot see it', () => {
    renderHome();
    expect(screen.getByRole('img', { name: /palm-leaf manuscript page/i })).toBeInTheDocument();
  });
});

describe('the coupling section', () => {
  it('is a comparison, with one row per product class', () => {
    renderHome();
    const table = screen.getByRole('table');
    // Three product classes, plus the header row.
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(
      within(table).getByRole('rowheader', { name: /taken unchanged from an authoritative text/i }),
    ).toBeInTheDocument();
  });

  it('is labelled as illustrative before a reader reads it', () => {
    renderHome();
    expect(screen.getAllByText('Illustrative example').length).toBeGreaterThan(0);
  });
});

describe('the demonstrated answer', () => {
  it('swaps the whole answer set when the jurisdiction changes, rather than filtering one', async () => {
    const user = userEvent.setup();
    renderHome();

    // India is showing: its sources, and not the UK's.
    expect(screen.getByText('The Patents Act, 1970')).toBeVisible();
    expect(screen.queryByText('Traditional herbal registration scheme')).not.toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'United Kingdom' }));

    expect(screen.getByText('Traditional herbal registration scheme')).toBeVisible();
    expect(screen.queryByText('The Patents Act, 1970')).not.toBeVisible();
  });

  it('gives the two jurisdictions different confidence, not one blended answer', () => {
    expect(DEMO_ANSWERS.IN.confidence).toBe('moderate');
    expect(DEMO_ANSWERS.INTL.confidence).toBe('low');
    expect(DEMO_ANSWERS.IN.jurisdiction).not.toBe(DEMO_ANSWERS.INTL.jurisdiction);
  });

  it('marks every demonstrated answer as illustrative', () => {
    renderHome();
    expect(
      screen.getAllByText('Illustrative example — demo sources, not a legal source').length,
    ).toBeGreaterThan(0);
  });

  it('renders the four blocks in a fixed order', () => {
    renderHome();
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    const answerBlocks = headings.filter((text) =>
      ['Answer', 'Why this matters', 'What to check', 'Caveats'].includes(text ?? ''),
    );
    expect(answerBlocks).toEqual(['Answer', 'Why this matters', 'What to check', 'Caveats']);
  });

  it('opens a source passage on request', async () => {
    const user = userEvent.setup();
    renderHome();

    const [firstToggle] = screen.getAllByRole('button', { name: 'Show the passage' });
    expect(screen.queryByText(/Demo passage/)).not.toBeInTheDocument();

    await user.click(firstToggle!);
    expect(screen.getAllByText(/Demo passage/).length).toBeGreaterThan(0);
  });
});

describe('demo content can never pass for a verified source', () => {
  it('marks every demo citation, in both jurisdictions', () => {
    for (const answer of Object.values(DEMO_ANSWERS)) {
      expect(answer.is_demo).toBe(true);
      for (const citation of answer.citations) {
        expect(citation.verification_status).toBe('demo');
        expect(citation.document_id.startsWith('demo-')).toBe(true);
      }
    }
  });

  it('quotes no statutory wording it has not retrieved', () => {
    for (const answer of Object.values(DEMO_ANSWERS)) {
      for (const citation of demoCitationsFor(answer)) {
        expect(citation.passage).toMatch(/^Demo passage\./);
      }
    }
  });

  it('carries no invented as-of date or corpus version', () => {
    for (const answer of Object.values(DEMO_ANSWERS)) {
      expect(answer.as_of_date).toBeNull();
      expect(answer.corpus_version).toBeNull();
    }
  });
});

describe('languages', () => {
  it('shows a specimen in each of the six scripts', () => {
    renderHome();
    for (const [code, name] of [
      ['en', 'English'],
      ['hi', 'हिंदी'],
      ['te', 'తెలుగు'],
      ['ta', 'தமிழ்'],
      ['bn', 'বাংলা'],
      ['mr', 'मराठी'],
    ] as const) {
      const heading = screen.getByText(name);
      expect(heading).toHaveAttribute('lang', code);
    }
  });
});

describe('accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderHome();
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});
