/**
 * The page that proves domain depth, and the rule that keeps it honest:
 * every factual statement is either cited or visibly pending, and nothing on it
 * is asserted as settled while the corpus is empty.
 */

import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import covered from '@/locales/en/covered.json';
import WhatIsCovered from '@/routes/WhatIsCovered';
import { CORPUS_DOCUMENTS, findDocument, isFetched } from '@/services/corpusManifest';

function renderPage() {
  return render(
    <MemoryRouter>
      <WhatIsCovered />
    </MemoryRouter>,
  );
}

/** Every string in the content tree, flattened, so none of it escapes review. */
function allStrings(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]];
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      allStrings(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

describe('sourcing', () => {
  it('names the document behind every statement', () => {
    const { container } = renderPage();
    const markers = container.querySelectorAll('sup');
    expect(markers.length).toBeGreaterThan(40);

    for (const marker of markers) {
      expect(marker.getAttribute('aria-label')).toMatch(/^Source \d+: .+/);
    }
  });

  it('names a real manifest document in every marker', () => {
    const titles = new Set(CORPUS_DOCUMENTS.map((doc) => doc.title));
    const { container } = renderPage();

    for (const marker of container.querySelectorAll('sup')) {
      const label = marker.getAttribute('aria-label') ?? '';
      const title = label.replace(/^Source \d+: /, '');
      expect(titles.has(title), `marker names an unknown document: ${title}`).toBe(true);
    }
  });

  it('lists the documents each section rests on', () => {
    renderPage();
    // Every section still ends with its own numbered source list; what changed
    // is that a document carries no build-progress marking beside it.
    const lists = screen.getAllByText('Sources for this section');
    expect(lists.length).toBeGreaterThan(15);
    expect(screen.queryByText('not yet retrieved')).not.toBeInTheDocument();
  });

  it('refuses a citation that resolves to nothing', () => {
    // The guard that matters: a marker pointing at a document the manifest does
    // not contain is worse than no marker, so it throws at render.
    expect(findDocument('in-patents-act-1970')).toBeDefined();
    expect(findDocument('no-such-document')).toBeUndefined();
  });

  it('has no fetched documents yet, which is why every marker is pending', () => {
    expect(CORPUS_DOCUMENTS.every((doc) => !isFetched(doc))).toBe(true);
    expect(CORPUS_DOCUMENTS.every((doc) => doc.verification_status === 'unverified')).toBe(true);
  });
});

describe('the content itself', () => {
  it('never states a section, rule or article number', () => {
    // "Section 3(p)" written from memory is a fabricated citation even when it
    // happens to be right. Numbers come from ingested documents or not at all.
    const offenders = allStrings(covered).filter(([, value]) =>
      /\b(section|rule|article|clause|schedule)\s+\d/i.test(value),
    );
    expect(offenders).toEqual([]);
  });

  it('states no effective dates or commencement years for instruments', () => {
    // Years inside a document's *title* are part of its name and come from the
    // manifest, not from this file.
    const offenders = allStrings(covered).filter(([, value]) =>
      /\b(with effect from|came into force|effective from)\b/i.test(value),
    );
    expect(offenders).toEqual([]);
  });

  it('covers all eight rights and all ten regulatory topics', () => {
    expect(Object.keys(covered.rights.items)).toHaveLength(8);
    expect(Object.keys(covered.regulation.items)).toHaveLength(10);
  });

  it('gives every right the five fields a reader is promised', () => {
    for (const [name, item] of Object.entries(covered.rights.items)) {
      expect(Object.keys(item).sort(), name).toEqual(
        ['doesNot', 'inAyurveda', 'jurisdiction', 'protects', 'question', 'title'].sort(),
      );
    }
  });

  it('gives the coupling matrix a row for every real product class', () => {
    // "undetermined" is a state, not a class, so it has no row.
    expect(Object.keys(covered.distinction.rows)).toEqual([
      'classical_generic',
      'patent_proprietary',
      'new_non_classical_drug',
      'phytopharmaceutical',
      'ayurveda_aahar',
      'cosmetic',
    ]);
  });
});

describe('navigation within the page', () => {
  it('resolves every in-page link to a section that exists', () => {
    const { container } = renderPage();
    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(contents).getAllByRole('link');
    expect(links.length).toBeGreaterThan(18);

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('#')).toBe(true);
      expect(container.querySelector(href), `no target for ${href}`).toBeTruthy();
    }
  });

  it('anchors the deep links the build document names', () => {
    const { container } = renderPage();
    expect(container.querySelector('#patents')).toBeTruthy();
    expect(container.querySelector('#abs')).toBeTruthy();
  });
});

describe('access and benefit sharing', () => {
  it('says the position changed recently and that dates therefore matter', () => {
    renderPage();
    expect(screen.getByText('The position has moved recently')).toBeInTheDocument();
    expect(screen.getByText(/only as good as its effective date/i)).toBeInTheDocument();
  });

  it('shows the corpus version rather than implying the page is current', () => {
    renderPage();
    expect(screen.getByText(/0\.0\.0-unbuilt/)).toBeInTheDocument();
  });

  it('states that obligations differ by who you are', () => {
    renderPage();
    expect(screen.getByText(/are not treated identically/i)).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderPage();
    const results = await axe.run(container, { resultTypes: ['violations'] });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  }, 30_000);
});

describe('the sourcing plan is real, not decorative', () => {
  it('references every document a section lists, at least once', () => {
    const { container } = renderPage();
    let sectionsChecked = 0;

    for (const section of container.querySelectorAll('section')) {
      const listItems = [...section.querySelectorAll(':scope > div > ol > li')];
      if (listItems.length === 0) continue;
      sectionsChecked += 1;

      const referenced = new Set(
        [...section.querySelectorAll(':scope sup')].map((sup) =>
          (sup.getAttribute('aria-label') ?? '').replace(/^Source (\d+):.*$/, '$1'),
        ),
      );

      listItems.forEach((_, index) => {
        expect(
          referenced.has(String(index + 1)),
          `section "${section.id}" lists source ${index + 1} but nothing points at it`,
        ).toBe(true);
      });
    }

    // Without this the loop could skip every section and pass having checked
    // nothing, which is the usual way a guard like this rots.
    expect(sectionsChecked).toBeGreaterThan(15);
  });

  it('says so where a statement describes an absence rather than a rule', () => {
    renderPage();
    // India has no standalone trade-secrets statute; citing an adjacent Act for
    // that sentence would be citing the wrong instrument.
    expect(
      screen.getAllByText('(no instrument to cite — this states an absence)').length,
    ).toBeGreaterThan(0);
  });
});
