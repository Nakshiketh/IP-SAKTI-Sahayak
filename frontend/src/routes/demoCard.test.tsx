import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from '@/App';

/** The demo member card page: there only when the API says so, and reachable signed out. */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderCard() {
  render(
    <MemoryRouter initialEntries={['/demo/member-card']}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

it('shows the card, signed out, with its details and the QR the API serves', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/v1/demo/member-card'
        ? json({
            name: 'Nakshiketh',
            role: 'Student / Researcher',
            institution: 'MGIT',
            memberId: 'IPS-2026-0001',
            issuedOn: '2026-09-26',
          })
        : json({}, 404),
    ),
  );
  renderCard();
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Demo member card' }),
  ).toBeInTheDocument();
  const card = screen.getByRole('article', { name: 'Member card of Nakshiketh' });
  for (const text of [
    'IP-SAKTI Sahayak',
    'Nakshiketh',
    'Student / Researcher',
    'MGIT',
    'IPS-2026-0001',
    '2026-09-26',
    'Scan at the IP-SAKTI Sahayak Member Portal',
  ]) {
    expect(card).toHaveTextContent(text);
  }
  expect(card.querySelector('img')).toHaveAttribute('src', '/api/v1/demo/member-card/qr.png');
  expect(screen.getByRole('button', { name: 'Download card (PNG)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Print card' })).toBeInTheDocument();
  // No photograph, and no placeholder for one.
  expect(card.querySelectorAll('img')).toHaveLength(1);
});

it('is the ordinary not-found page when the card is switched off', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json({ code: 'not_found', message: 'Not found.' }, 404)),
  );
  renderCard();
  expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent(
    'Demo member card',
  );
  expect(screen.queryByRole('button', { name: 'Print card' })).toBeNull();
});

it('says what to run when the card image has not been written', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json(
        {
          code: 'card_image_missing',
          message:
            'The card image has not been written. Run: python -m app.auth.cli issue-card --member IPS-2026-0001',
        },
        404,
      ),
    ),
  );
  renderCard();
  expect(await screen.findByRole('alert')).toHaveTextContent('issue-card');
});

it('prints on request', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        name: 'N',
        role: 'R',
        institution: 'I',
        memberId: 'IPS-2026-0001',
        issuedOn: '2026-09-26',
      }),
    ),
  );
  renderCard();
  (await screen.findByRole('button', { name: 'Print card' })).click();
  expect(print).toHaveBeenCalled();
  print.mockRestore();
});
