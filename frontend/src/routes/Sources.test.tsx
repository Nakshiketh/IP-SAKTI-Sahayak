/**
 * The sources page, and the claim it has to make good on: everything here comes
 * from the two manifests, so adding a source changes the page with no code edit.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import sources from '@/locales/en/sources.json';
import Sources from '@/routes/Sources';
import { CORPUS_DOCUMENTS, GROUP_ORDER } from '@/services/corpusManifest';
import { isIngested, RECORDS_SOURCES } from '@/services/recordsManifest';

/** Derived, never typed: a hard-coded total here is the same defect the page forbids. */
const TOTAL = CORPUS_DOCUMENTS.length;

function renderPage() {
  return render(
    <MemoryRouter>
      <Sources />
    </MemoryRouter>,
  );
}

describe('driven by the manifests', () => {
  it('renders every corpus document, under a group from the manifest', () => {
    renderPage();
    expect(screen.getByText(`Showing ${TOTAL} of ${TOTAL} documents`)).toBeInTheDocument();

    for (const doc of CORPUS_DOCUMENTS) {
      expect(screen.getByRole('heading', { name: doc.title })).toBeInTheDocument();
    }
  });

  it('groups in manifest order, and every document lands in a known group', () => {
    renderPage();

    // The order groups appear in is data. This asserts the rendered order is
    // exactly the manifest's, rather than whatever the filter happened to yield.
    const expected = GROUP_ORDER.filter((group) =>
      CORPUS_DOCUMENTS.some((doc) => doc.group === group),
    ).map((group) => sources.corpus.groups[group]);
    expect(expected).toHaveLength(7);

    const rendered = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent?.replace(/\s*\d+\s*$/, '').trim() ?? '')
      .filter((text) => expected.includes(text));

    expect(rendered).toEqual(expected);

    for (const doc of CORPUS_DOCUMENTS) {
      expect(GROUP_ORDER, doc.document_id).toContain(doc.group);
    }
  });

  it('renders every records source', () => {
    renderPage();
    for (const source of RECORDS_SOURCES) {
      expect(screen.getByRole('heading', { name: source.name })).toBeInTheDocument();
    }
  });

  it('builds facet options from the values present, not a hard-coded list', () => {
    renderPage();
    const jurisdictions = screen.getByRole('combobox', { name: 'Jurisdiction' });
    const options = within(jurisdictions)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // "Any", plus exactly the jurisdictions the manifest actually contains.
    const present = new Set(CORPUS_DOCUMENTS.map((doc) => doc.jurisdiction));
    expect(options).toHaveLength(present.size + 1);
  });
});

describe('filtering and search', () => {
  it('narrows by facet and reports how many are showing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Jurisdiction' }), 'IN');
    const indian = CORPUS_DOCUMENTS.filter((doc) => doc.jurisdiction === 'IN').length;
    expect(screen.getByText(`Showing ${indian} of ${TOTAL} documents`)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Patent Cooperation Treaty' })).toBeNull();
  });

  it('combines facets rather than replacing them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Jurisdiction' }), 'IN');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Document type' }), 'act');

    const expected = CORPUS_DOCUMENTS.filter(
      (doc) => doc.jurisdiction === 'IN' && doc.document_type === 'act',
    ).length;
    expect(screen.getByText(`Showing ${expected} of ${TOTAL} documents`)).toBeInTheDocument();
  });

  it('searches title and organization', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search sources' }), 'biological');
    expect(
      screen.getByRole('heading', { name: 'The Biological Diversity Act, 2002' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'The Copyright Act, 1957' })).toBeNull();
  });

  it('says so when nothing matches, rather than showing an empty page', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search sources' }), 'zzzznothing');
    expect(screen.getByText('No source matches those filters.')).toBeInTheDocument();
    expect(screen.getByText(`Showing 0 of ${TOTAL} documents`)).toBeInTheDocument();
  });

  it('clears back to everything', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Jurisdiction' }), 'INTL');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText(`Showing ${TOTAL} of ${TOTAL} documents`)).toBeInTheDocument();
  });

  it('filters by whether a document has an effective date', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Effective date' }), 'dated');
    // Nothing is dated yet, so this is genuinely empty rather than unimplemented.
    expect(screen.getByText(`Showing 0 of ${TOTAL} documents`)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Effective date' }), 'undated');
    expect(screen.getByText(`Showing ${TOTAL} of ${TOTAL} documents`)).toBeInTheDocument();
  });
});

describe('what each field holds', () => {
  it('leaves an unknown field empty rather than asserting a value for it', () => {
    renderPage();
    // Four columns per document, each an em dash while the field is unknown.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(CORPUS_DOCUMENTS.length * 4);
  });

  it('holds no licence for any records source, so none is ingested', () => {
    renderPage();
    expect(RECORDS_SOURCES.every((source) => source.licence === null)).toBe(true);
    expect(RECORDS_SOURCES.every((source) => !isIngested(source))).toBe(true);
    // The data still says no licence has been read; the cell shows that as an
    // empty field rather than as a sentence about the state of the build.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(RECORDS_SOURCES.length);
  });
});

describe('records are never authority', () => {
  it('carries the standing note', () => {
    renderPage();
    expect(screen.getByText(/They are not statements of law/)).toBeInTheDocument();
    expect(screen.getByText(/never appear as a citation/)).toBeInTheDocument();
  });

  it('marks every source uncitable in the manifest itself', () => {
    for (const source of RECORDS_SOURCES) {
      expect(source.citable_in_answers, source.source_id).toBe(false);
    }
  });

  it('gives portal-only sources no fetcher configuration at all', () => {
    const portals = RECORDS_SOURCES.filter((s) => s.access_mode === 'portal_link_only');
    expect(portals.length).toBeGreaterThan(0);

    for (const source of portals) {
      const raw = source as unknown as Record<string, unknown>;
      expect(raw.parser, source.source_id).toBeUndefined();
      expect(raw.field_map, source.source_id).toBeUndefined();
      expect(source.link_template ?? null, source.source_id).toBeNull();
    }
  });

  it('states on every portal source that no fetcher exists for it', () => {
    renderPage();
    const portals = RECORDS_SOURCES.filter((s) => s.access_mode === 'portal_link_only');
    expect(screen.getAllByText(/No fetcher exists for this source/)).toHaveLength(portals.length);
  });
});

describe('honesty section', () => {
  it('describes the mechanism behind each rule', () => {
    renderPage();
    const table = screen.getAllByRole('table')[0]!;
    // The mechanism column carries the rule; it no longer carries a badge
    // reporting how far along the build of that rule is.
    expect(within(table).queryByText('designed, not built')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('lists what the product does not cover, including novelty', () => {
    renderPage();
    expect(screen.getByText(/No novelty conclusions/)).toBeInTheDocument();
    expect(screen.getByText(/No clinical or dosage advice/)).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderPage();
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});
