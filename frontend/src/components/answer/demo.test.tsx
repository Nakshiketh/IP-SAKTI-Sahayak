/**
 * The demo path a jury walks, and the promise it rests on.
 *
 * T11: the button fetches the question from the API and asks it through the
 * ordinary route. No answer is stored in this bundle, and none can be — the
 * panel navigates with a question and the workspace does the rest.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictMatrix } from '@/components/answer/ConflictMatrix';
import { GuidanceEnds } from '@/components/answer/GuidanceEnds';
import { JuryDemo } from '@/components/home/JuryDemo';
import type { Analysis, Citation, Conflict } from '@/types/domain';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

afterEach(() => {
  vi.restoreAllMocks();
  navigate.mockReset();
});

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    facts: [],
    missing_facts: [],
    product_class: 'undetermined',
    alternative_classes: [],
    classification_rule_id: null,
    changes_if: null,
    issues: [],
    conflicts: [],
    applicability: [],
    escalation: { level: 'l3', reason_keys: [], specialists: ['registered_patent_agent'] },
    abstain_code: null,
    unsupported_jurisdictions: [],
    ...overrides,
  };
}

function conflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    conflict_id: 'cf-1',
    conflict_type: 'jurisdictional',
    issue: 'patent',
    source_a: 'in-patents-act-1970',
    source_b: 'intl-pct',
    governing_source: null,
    explanation_key: 'conflictJurisdictional',
    resolution_status: 'separate_obligations',
    reasoning_basis: 'jurisdiction',
    requires_human_review: false,
    ...overrides,
  };
}

const CITATIONS: Citation[] = [
  {
    citation_id: 'c1',
    chunk_id: 'c1',
    document_id: 'in-patents-act-1970',
    document_title: 'The Patents Act, 1970',
    organization: 'An authority',
    jurisdiction: 'IN',
    section_label: null,
    page: null,
    url: null,
    retrieval_score: null,
    rerank_score: null,
    verification_status: 'verified',
    as_of_date: null,
    review_state: null,
    reviewed_at: null,
    provenance_pending: false,
  },
];

describe('the jury demo', () => {
  it('fetches the question from the API and asks it through the ordinary route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'x', language: 'en', question: 'A hard question' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(
      <MemoryRouter>
        <JuryDemo />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /run complex case/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/demo/flagship-case');
    expect(navigate).toHaveBeenCalledWith('/sahayak?q=A%20hard%20question');
  });

  it('shows the real error rather than falling back to a stored case', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 503, statusText: 'Service Unavailable' }),
    );

    render(
      <MemoryRouter>
        <JuryDemo />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /run complex case/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('503');
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('where guidance ends', () => {
  it('names the level, what cannot be concluded, and who should review', () => {
    render(<GuidanceEnds analysis={analysis()} />);
    expect(screen.getByRole('heading', { name: /where guidance ends/i })).toBeInTheDocument();
    // The level appears twice on purpose: as the badge, and inside the
    // stepper for a screen reader that cannot see which step is filled.
    expect(screen.getAllByText(/expert review needed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/novel or patentable/i)).toBeInTheDocument();
    expect(screen.getByText(/restricted TKDL/i)).toBeInTheDocument();
    expect(screen.getByText(/registered patent agent/i)).toBeInTheDocument();
  });

  it('lists the questions that would settle what is open', () => {
    render(
      <GuidanceEnds
        analysis={analysis({
          missing_facts: [{ key: 'therapeutic_claim', question: 'Does it treat a disease?' }],
        })}
      />,
    );
    expect(screen.getByText('Does it treat a disease?')).toBeInTheDocument();
  });

  it('renders nothing when there is no escalation to report', () => {
    const { container } = render(<GuidanceEnds analysis={analysis({ escalation: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the conflict matrix', () => {
  it('says two obligations both apply rather than presenting them as opposed', () => {
    render(
      <ConflictMatrix analysis={analysis({ conflicts: [conflict()] })} citations={CITATIONS} />,
    );
    expect(screen.getAllByText(/both apply/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/neither overrides the other/i).length).toBeGreaterThan(0);
  });

  it('shows the document title for a source it can name', () => {
    render(
      <ConflictMatrix analysis={analysis({ conflicts: [conflict()] })} citations={CITATIONS} />,
    );
    expect(screen.getAllByText('The Patents Act, 1970').length).toBeGreaterThan(0);
    // No citation for the other side, so the id stands in rather than a blank.
    expect(screen.getAllByText('intl-pct').length).toBeGreaterThan(0);
  });

  it('marks a conflict that needs a person', () => {
    render(
      <ConflictMatrix
        analysis={analysis({
          conflicts: [conflict({ resolution_status: 'unresolved', requires_human_review: true })],
        })}
        citations={CITATIONS}
      />,
    );
    expect(screen.getAllByText(/needs a person to decide/i).length).toBeGreaterThan(0);
  });

  it('renders nothing when no conflict was found', () => {
    const { container } = render(<ConflictMatrix analysis={analysis()} citations={CITATIONS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
