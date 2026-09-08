/**
 * The three tabs beside an answer, and the boundaries between them.
 *
 * A source is authority, a record is evidence that somebody filed something,
 * and a portal is a place this product deliberately did not look. The tests
 * here are mostly about the third: a list of registries under an answer reads
 * like a list of places that were checked unless the interface says otherwise,
 * loudly and more than once.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnswerPanel } from '@/components/sahayak/AnswerPanel';
import { i18n } from '@/i18n';
import { buildMockResult } from '@/services/query.mock';
import { RECORDS_SOURCES } from '@/services/recordsManifest';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function panelFor(question: string) {
  return render(<AnswerPanel result={buildMockResult(question, 'IN')} />);
}

describe('sources, records and portals are three different things', () => {
  it('separates them into tabs rather than one list', () => {
    panelFor('our herbal formulation patent');
    expect(screen.getByRole('tab', { name: /^Sources/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Related records/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Search elsewhere/ })).toBeInTheDocument();
  });

  it('says a record is not a statement of law, on the records tab', async () => {
    const user = userEvent.setup();
    panelFor('our herbal formulation patent');
    await user.click(screen.getByRole('tab', { name: /^Related records/ }));
    // The records tab says it, and the RecordCard says it again on every card.
    // Both are deliberate; this is the surface where the confusion is most
    // expensive, so it is stated more than once.
    expect(screen.getAllByText(/not a statement of law/i).length).toBeGreaterThan(1);
  });

  it('still reads as an abstention when records are present', async () => {
    const user = userEvent.setup();
    // Routes to "nothing relevant" and also matches records.
    panelFor('What are the rules in Brazil for our herbal formulation patent?');
    await user.click(screen.getByRole('tab', { name: /^Related records/ }));
    expect(screen.getByText(/These records do not answer the question/)).toBeInTheDocument();
    expect(screen.getByText(/The system still declined/)).toBeInTheDocument();
  });
});

describe('the registries this product did not search', () => {
  it('says so before listing any of them', async () => {
    const user = userEvent.setup();
    panelFor('our herbal formulation patent');
    await user.click(screen.getByRole('tab', { name: /^Search elsewhere/ }));

    expect(await screen.findByText('This product did not search these')).toBeInTheDocument();
    expect(screen.getByText(/finding nothing here would mean nothing/i)).toBeInTheDocument();
  });

  it('lists every portal, including the ones it cannot link to', async () => {
    const user = userEvent.setup();
    const { container } = panelFor('our herbal formulation patent');
    await user.click(screen.getByRole('tab', { name: /^Search elsewhere/ }));

    const region = (await screen.findByText('This product did not search these')).closest(
      '[data-search-elsewhere="true"]',
    ) as HTMLElement;
    const portals = RECORDS_SOURCES.filter((source) => source.access_mode === 'portal_link_only');
    expect(portals.length).toBeGreaterThan(0);

    await waitFor(() =>
      expect(within(region).getAllByRole('listitem')).toHaveLength(portals.length),
    );
    for (const portal of portals.slice(0, 3)) {
      expect(within(region).getByText(portal.name)).toBeInTheDocument();
    }
    expect(container).toBeTruthy();
  });

  it('offers no link it has not verified, and says why', async () => {
    const user = userEvent.setup();
    panelFor('our herbal formulation patent');
    await user.click(screen.getByRole('tab', { name: /^Search elsewhere/ }));

    const region = (await screen.findByText('This product did not search these')).closest(
      '[data-search-elsewhere="true"]',
    ) as HTMLElement;

    // Not one verified template exists yet, so not one link may be rendered.
    await waitFor(() => expect(within(region).queryAllByRole('link')).toHaveLength(0));
    expect(within(region).getAllByText(/Link not yet verified/).length).toBeGreaterThan(0);
  });
});
