/**
 * The homepage, and the one path through the middle: type a question, get an
 * answer with sources, open a source.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { askHref, PATENT_STEPS, toolHref } from '@/components/home/patentSteps';
import home from '@/locales/en/home.json';
import sahayak from '@/locales/en/sahayak.json';
import Home from '@/routes/Home';
import { CORPUS_DOCUMENTS } from '@/services/corpusManifest';
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

  // The drawn composition that used to sit beside the headline was removed; the
  // route-to-a-patent timeline occupies that space now and is covered below.
});

describe('the route to a patent', () => {
  it('is an ordered list of all twelve steps, in procedural order', () => {
    renderHome();
    const list = screen.getByRole('list', { name: /steps to get a patent/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(PATENT_STEPS.length);
    expect(items).toHaveLength(12);

    // The order is the content. Asserted against the data rather than a
    // hard-coded list, so reordering the array has to be a deliberate act.
    const titles = items.map((item) => within(item).getByRole('heading').textContent);
    expect(titles).toEqual(PATENT_STEPS.map((step) => home.patentSteps.steps[step.id].title));
  });

  it('renders every step body without JavaScript having revealed anything', () => {
    renderHome();
    // No IntersectionObserver fires in jsdom, so this is the no-JS case: the
    // copy has to be in the DOM regardless.
    for (const step of PATENT_STEPS) {
      expect(
        screen.getByText(home.patentSteps.steps[step.id].body, { exact: false }),
      ).toBeVisible();
    }
  });

  it('cites a real manifest document for every step', () => {
    const known = new Set(CORPUS_DOCUMENTS.map((doc) => doc.document_id));
    for (const step of PATENT_STEPS) {
      expect(step.documents.length).toBeGreaterThan(0);
      for (const id of step.documents) {
        expect(known, `${step.id} cites an unknown document: ${id}`).toContain(id);
      }
    }
  });

  it('names the traditional-knowledge sources on the first search step', () => {
    // The one substantive claim this section makes about Ayurveda: a
    // formulation's prior art includes documented traditional knowledge, so
    // the TKDL belongs in step one rather than as an afterthought.
    const first = PATENT_STEPS[0]!;
    expect(first.documents).toContain('in-tkdl-access-model');
    expect(first.documents).toContain('in-tk-biological-material-guidelines');
  });

  it('opens a step to reveal its citation and forms, and closes it again', async () => {
    const user = userEvent.setup();
    renderHome();

    const list = screen.getByRole('list', { name: /steps to get a patent/i });
    const filing = within(list).getAllByRole('listitem')[3]!;
    const toggle = within(filing).getByRole('button');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Form 1 and the agent authorisation both belong to the filing step.
    expect(within(filing).getByText(/Form 1/)).toBeVisible();
    expect(within(filing).getByText(/Form 26/)).toBeVisible();
    expect(within(filing).getByText(/Patents Act 1970/)).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('hands every step to the workspace with its own prepared question', () => {
    renderHome();
    const list = screen.getByRole('list', { name: /steps to get a patent/i });
    const items = within(list).getAllByRole('listitem');

    PATENT_STEPS.forEach((step, index) => {
      const ask = within(items[index]!).getByRole('link', { name: home.patentSteps.actions.ask });
      expect(ask).toHaveAttribute('href', askHref(home.patentSteps.questions[step.id]));
    });

    // Twelve different questions, not one question linked twelve times.
    const questions = PATENT_STEPS.map((step) => home.patentSteps.questions[step.id]);
    expect(new Set(questions).size).toBe(PATENT_STEPS.length);
  });

  it('words every prepared question so the pipeline reads it as a patent question', () => {
    // The understanding stage recognises a patent question by its vocabulary.
    // A step question without it is routed as something else entirely.
    for (const step of PATENT_STEPS) {
      expect(home.patentSteps.questions[step.id], step.id).toMatch(/patent/i);
    }
  });

  it('opens a workspace tool only at the steps the workspace has one for', () => {
    renderHome();
    const list = screen.getByRole('list', { name: /steps to get a patent/i });
    const items = within(list).getAllByRole('listitem');
    const toolNames = [home.patentSteps.actions.priorArt, home.patentSteps.actions.classify];

    PATENT_STEPS.forEach((step, index) => {
      const tools = within(items[index]!)
        .getAllByRole('link')
        .filter((link) => toolNames.includes(link.textContent ?? ''));
      if (step.tool === null) {
        expect(tools, step.id).toHaveLength(0);
      } else {
        expect(tools, step.id).toHaveLength(1);
        expect(tools[0]).toHaveAttribute('href', toolHref(step.tool));
      }
    });

    expect(PATENT_STEPS[0]!.tool).toBe('priorArt');
    expect(PATENT_STEPS[1]!.tool).toBe('classify');
  });

  it('lands a reader at the first step in the prior-art tool itself', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('link', { name: home.patentSteps.actions.priorArt }));

    expect(screen.getByTestId('location')).toHaveTextContent('/sahayak?flow=priorArt');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText(sahayak.flows.priorArt.title).length).toBeGreaterThan(0);
  });

  it('marks no step current until one has been reached', () => {
    renderHome();
    // jsdom fires no intersections, so nothing has been scrolled past. A step
    // marked current here would be a lie told by the initial render.
    const list = screen.getByRole('list', { name: /steps to get a patent/i });
    const current = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('aria-current') !== null);
    expect(current).toHaveLength(0);
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

  // The "Illustrative example" eyebrow above the worked example was removed;
  // what the section demonstrates is asserted by the tests around it.
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

  it('carries the source note on the demonstrated answer', () => {
    renderHome();
    expect(screen.getAllByText(/Verify against the official text/i).length).toBeGreaterThan(0);
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
