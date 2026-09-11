/**
 * The analyst page against a stubbed API: the conversation opens, a message is
 * sent, the stages stream in, and the reply and the extracted composition appear.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Analyst from '@/routes/Analyst';
import type { Conversation } from '@/services/analyst';
import { signInForTest, signOutForTest } from '@/test/signedIn';

const INVENTION = {
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
};

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    title: 'New invention',
    created_at: 1,
    updated_at: 1,
    invention: INVENTION,
    messages: [
      { id: 1, role: 'assistant', text: 'Describe your invention.', created_at: 1, meta: {} },
    ],
    analysis: null,
    missing: ['form', 'ingredients'],
    ready: false,
    history: [],
    engine: 'rules',
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => signInForTest());
afterEach(() => {
  signOutForTest();
  vi.unstubAllGlobals();
});

describe('analyse my invention', () => {
  it('sends a message and shows the streamed reply and the extracted composition', async () => {
    const after = conversation({
      invention: {
        ...INVENTION,
        form: 'face_pack',
        ingredients: [
          {
            key: 'neem',
            name: 'Neem',
            vocabulary_id: 'neem',
            label: 'Neem (Nimba)',
            kind: 'traditional',
            amount: null,
            percent: 10,
            percent_derived: null,
            purpose: null,
          },
        ],
      },
      messages: [
        ...conversation().messages,
        { id: 2, role: 'user', text: 'A face pack with Neem 10%', created_at: 2, meta: {} },
        {
          id: 3,
          role: 'assistant',
          text: 'Noted: Added Neem (10%).\n\nWhat is it for?',
          created_at: 3,
          meta: { asking: 'use' },
        },
      ],
    });
    const stream = [
      { event: 'stage', id: 'understand', ran: true, ms: 1 },
      { event: 'stage', id: 'extract', ran: true, ms: 1 },
      { event: 'result', conversation: after },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/status')) {
        return json({
          engine: 'rules',
          products: { count: 14, retrieved_at: '2026-09-11' },
          records: { available: false, count: 0 },
          traditional_reference: 54,
        });
      }
      if (url.endsWith('/conversations') && (init?.method ?? 'GET') === 'GET') return json([]);
      if (url.endsWith('/conversations')) return json(conversation(), 201);
      if (url.endsWith('/messages')) {
        return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
      }
      return json({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Analyst />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Describe your invention.')).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Message to the analyst'), 'A face pack with Neem 10%');
    await user.click(screen.getByRole('button', { name: /Send/ }));

    expect(await screen.findByText('What is it for?')).toBeInTheDocument();
    const sent = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/messages'));
    expect(sent?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test-token' });

    const table = screen.getByRole('table');
    expect(within(table).getByText('Neem')).toBeInTheDocument();
    expect(within(table).getByText('10%')).toBeInTheDocument();
  });

  it('says so when the session is no longer valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ code: 'session_expired' }, 401)),
    );
    render(
      <MemoryRouter>
        <Analyst />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/);
  });
});
