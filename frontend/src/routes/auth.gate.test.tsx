import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import App from '@/App';
import { apiFetch, SESSION_EVENT } from '@/lib/http';
import { signInForTest } from '@/test/signedIn';

/**
 * The sign-in gate: who sees what, and that nobody sees a protected page they
 * should not, even for a frame.
 */

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  );
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | undefined) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(String(input), init) ?? new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe('an anonymous reader', () => {
  it('typing a protected address lands on the portal, with no page content first', async () => {
    stubFetch(() => undefined);
    renderAt('/sahayak');
    // Before the server has answered, nothing at all is rendered.
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Registered Member Portal' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(screen.queryByRole('link', { name: 'Ask Sahayak' })).toBeNull();
  });

  it('has no way to register', async () => {
    stubFetch(() => undefined);
    renderAt('/login');
    await screen.findByRole('heading', { level: 1, name: 'Registered Member Portal' });
    expect(screen.queryByText(/create one/i)).toBeNull();
    expect(screen.queryByText(/create an account/i)).toBeNull();
  });

  it('logs in with a Member ID or username and lands on the home page', async () => {
    const fetchSpy = stubFetch((url) =>
      url === '/api/v1/auth/login'
        ? new Response(JSON.stringify({ next: 'dashboard' }), { status: 200 })
        : undefined,
    );
    const { currentTestSession } = await import('@/test/signedIn');
    expect(currentTestSession().state).toBe('anonymous');

    const user = userEvent.setup();
    renderAt('/login/password');
    await user.type(await screen.findByLabelText('Member ID or username'), 'IPS-2026-0001');
    await user.type(screen.getByLabelText('Password'), 'Correct-horse-1');
    signInForTest(); // what the server now says when asked
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    const [, init] = fetchSpy.mock.calls.find(([url]) => url === '/api/v1/auth/login')!;
    expect(JSON.parse(String(init?.body))).toEqual({
      identifier: 'IPS-2026-0001',
      password: 'Correct-horse-1',
    });
    expect(init?.headers).toMatchObject({ 'X-Sahayak-CSRF': '1' });
    expect(init?.credentials).toBe('same-origin');
  });

  it('shows the server’s generic message on a failed login', async () => {
    stubFetch((url) =>
      url === '/api/v1/auth/login'
        ? new Response(
            JSON.stringify({
              code: 'invalid_credentials',
              message: 'Member ID/username or password is incorrect.',
            }),
            { status: 401 },
          )
        : undefined,
    );
    const user = userEvent.setup();
    renderAt('/login/password');
    await user.type(await screen.findByLabelText('Member ID or username'), 'someone');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByText('Member ID/username or password is incorrect.'),
    ).toBeInTheDocument();
  });

  it('says so plainly when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();
    renderAt('/login/password');
    await user.type(await screen.findByLabelText('Member ID or username'), 'someone');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
  });
});

describe('a member on a temporary password', () => {
  it('can reach only the create-password step', async () => {
    stubFetch(() => undefined);
    signInForTest({ restricted: true });
    renderAt('/sahayak');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create your new password' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/create-password');
    expect(screen.getByText(/uses a temporary password/)).toBeInTheDocument();
  });

  it('sees the four rules fill in, and the new password is sent to the server', async () => {
    const fetchSpy = stubFetch((url) =>
      url === '/api/v1/auth/password/change'
        ? new Response(JSON.stringify({ next: 'dashboard' }), { status: 200 })
        : undefined,
    );
    signInForTest({ restricted: true });
    const user = userEvent.setup();
    renderAt('/create-password');
    await user.type(await screen.findByLabelText('New password'), 'Fresh-Leaf-2026');
    for (const rule of [
      '8 to 128 characters',
      'An uppercase letter',
      'A lowercase letter',
      'A number',
    ]) {
      expect(screen.getByText(rule).closest('li')).toHaveTextContent('(done)');
    }
    await user.type(screen.getByLabelText('Confirm new password'), 'Fresh-Leaf-2026');
    signInForTest();
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    const [, init] = fetchSpy.mock.calls.find(([url]) => url === '/api/v1/auth/password/change')!;
    expect(JSON.parse(String(init?.body))).toEqual({
      newPassword: 'Fresh-Leaf-2026',
      confirmPassword: 'Fresh-Leaf-2026',
    });
  });

  it('shows the server’s reason when it refuses a password', async () => {
    stubFetch((url) =>
      url === '/api/v1/auth/password/change'
        ? new Response(JSON.stringify({ code: 'password_unchanged', message: 'x' }), {
            status: 422,
          })
        : undefined,
    );
    signInForTest({ restricted: true });
    const user = userEvent.setup();
    renderAt('/create-password');
    await user.type(await screen.findByLabelText('New password'), 'Temp-Pass-99');
    await user.type(screen.getByLabelText('Confirm new password'), 'Temp-Pass-99');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(
      await screen.findByText('Choose a password different from your temporary one.'),
    ).toBeInTheDocument();
  });
});

describe('a signed-in member', () => {
  it('opening the portal goes to the home page', async () => {
    stubFetch(() => undefined);
    signInForTest();
    renderAt('/login');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });

  it('logging out ends the session on the server and says so', async () => {
    const fetchSpy = stubFetch((url) =>
      url === '/api/v1/auth/logout' ? new Response(null, { status: 204 }) : undefined,
    );
    signInForTest();
    const user = userEvent.setup();
    renderAt('/sources');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText("You've been logged out.")).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    const [, init] = fetchSpy.mock.calls.find(([url]) => url === '/api/v1/auth/logout')!;
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'X-Sahayak-CSRF': '1' });
  });

  it('an expired session anywhere sends the reader to the portal with the reason', async () => {
    stubFetch(() => undefined);
    signInForTest();
    renderAt('/sources');
    await screen.findByRole('button', { name: 'Sign out' });
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: 'expired' }));
    expect(await screen.findByText('Your session has expired. Log in again.')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });
});

describe('apiFetch', () => {
  it('adds the CSRF header to writes only, and never an Authorization header', async () => {
    const spy = stubFetch(() => undefined);
    await apiFetch('/api/v1/sources');
    await apiFetch('/api/v1/feedback', { method: 'POST', headers: { 'content-type': 'x' } });
    const read = spy.mock.calls[0]?.[1];
    const write = spy.mock.calls[1]?.[1];
    expect(read?.headers).not.toHaveProperty('X-Sahayak-CSRF');
    expect(write?.headers).toEqual({ 'content-type': 'x', 'X-Sahayak-CSRF': '1' });
    for (const [, init] of spy.mock.calls) {
      expect(init?.headers).not.toHaveProperty('Authorization');
      expect(init?.credentials).toBe('same-origin');
    }
  });

  it('announces a 401 and a restricted 403', async () => {
    const heard: string[] = [];
    const listener = (event: Event) => heard.push((event as CustomEvent<string>).detail);
    window.addEventListener(SESSION_EVENT, listener);
    stubFetch((url) =>
      url.endsWith('/sources')
        ? new Response('{}', { status: 401 })
        : new Response(JSON.stringify({ code: 'password_change_required' }), { status: 403 }),
    );
    await apiFetch('/api/v1/sources');
    await apiFetch('/api/v1/query', { method: 'POST' });
    window.removeEventListener(SESSION_EVENT, listener);
    expect(heard).toEqual(['expired', 'restricted']);
  });

  it('does not announce the sign-in endpoints’ own refusals', async () => {
    const heard: string[] = [];
    const listener = (event: Event) => heard.push((event as CustomEvent<string>).detail);
    window.addEventListener(SESSION_EVENT, listener);
    stubFetch(() => new Response('{}', { status: 401 }));
    await apiFetch('/api/v1/auth/login', { method: 'POST' });
    window.removeEventListener(SESSION_EVENT, listener);
    expect(heard).toEqual([]);
  });
});
