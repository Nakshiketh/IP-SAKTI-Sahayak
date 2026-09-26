import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import App from '@/App';
import { CodeStep } from '@/components/auth/CodeStep';

/** The emailed-code step and the forgot-password flow, against a stubbed API. */

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe('the code step', () => {
  const member = {
    name: 'Nakshiketh',
    role: 'Student / Researcher',
    institution: 'MGIT',
    memberId: 'IPS-2026-0001',
  };

  function renderStep(onSubmit: (code: string) => Promise<void>, resendIn = 42) {
    const onRestart = vi.fn();
    render(
      <CodeStep
        challengeId="c1"
        member={member}
        maskedEmail="n**********8@gmail.com"
        resendAvailableAt={Date.now() / 1000 + resendIn}
        onSubmit={onSubmit}
        onRestart={onRestart}
        restartLabel="Scan your Member ID again"
      />,
    );
    return { onRestart };
  }

  it('shows the member record, where the code went, and focuses its heading', () => {
    renderStep(vi.fn());
    expect(screen.getByText('Member ID verified')).toBeInTheDocument();
    expect(screen.getByText('IPS-2026-0001')).toBeInTheDocument();
    expect(
      screen.getByText(
        'We sent a 6-digit code to n**********8@gmail.com. It expires in 5 minutes.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enter your verification code' })).toHaveFocus();
    const input = screen.getByLabelText('6-digit code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('submits by itself once six digits are in, and ignores anything else typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderStep(onSubmit);
    await userEvent.type(screen.getByLabelText('6-digit code'), '12a34-56');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('123456'));
  });

  it('accepts a pasted code', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderStep(onSubmit);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('6-digit code'));
    await user.paste('654321');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('654321'));
  });

  it('shows the server’s words for a wrong code', async () => {
    const { AuthError } = await import('@/services/auth');
    renderStep(() =>
      Promise.reject(
        new AuthError('That code is incorrect. 3 attempts left.', 'OTP_INCORRECT', 400),
      ),
    );
    await userEvent.type(screen.getByLabelText('6-digit code'), '000000');
    expect(await screen.findByText('That code is incorrect. 3 attempts left.')).toBeInTheDocument();
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
  });

  it('offers a restart once the code is locked', async () => {
    const { AuthError } = await import('@/services/auth');
    const { onRestart } = renderStep(() =>
      Promise.reject(
        new AuthError(
          'Too many incorrect attempts. Scan your Member ID again to get a new code.',
          'OTP_LOCKED',
          400,
        ),
      ),
    );
    await userEvent.type(screen.getByLabelText('6-digit code'), '000000');
    await screen.findByText(/Too many incorrect attempts/);
    expect(screen.getByLabelText('6-digit code')).toBeDisabled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Scan your Member ID again' })[0]!);
    expect(onRestart).toHaveBeenCalled();
  });

  it('counts down to a resend button', () => {
    renderStep(vi.fn(), 42);
    expect(screen.getByText(/Resend code in 0:4[12]/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();
  });

  it('resends when the countdown is over', async () => {
    const spy = vi.fn(async () => json({ resendAvailableAt: Date.now() / 1000 + 60 }));
    vi.stubGlobal('fetch', spy);
    renderStep(vi.fn(), -1);
    await userEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    await waitFor(() => expect(screen.getByText(/Resend code in/)).toBeInTheDocument());
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/auth/otp/resend');
    expect(JSON.parse(String(init.body))).toEqual({ challengeId: 'c1' });
  });
});

describe('forgot password', () => {
  it('runs from details to a new password and back to log in', async () => {
    const calls: Array<[string, unknown]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push([url, init?.body ? JSON.parse(String(init.body)) : null]);
        if (url === '/api/v1/auth/password/forgot') {
          return json({
            message:
              'If these details match a registered member, a verification code has been sent to the registered email.',
            challengeId: 'reset-1',
          });
        }
        if (url === '/api/v1/auth/password/forgot/verify') return json({ message: 'ok' });
        if (url === '/api/v1/auth/password/reset') return json({ message: 'ok' });
        return json({});
      }),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
        <Where />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('link', { name: 'Forgot password?' }));
    // Both pages have a "Member ID or username" field: wait for this one.
    await screen.findByRole('heading', { level: 1, name: 'Reset your password' });
    const identifier = screen.getByLabelText('Member ID or username');
    await waitFor(() => expect(identifier).toHaveFocus());
    await user.type(identifier, 'IPS-2026-0001');
    await user.type(screen.getByLabelText('Registered email'), 'nakshiketh28@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Send verification code' }));

    expect(
      await screen.findByText(/If these details match a registered member/),
    ).toBeInTheDocument();
    // The code step does not say where a code went.
    expect(screen.queryByText(/@gmail\.com/)).toBeNull();

    await user.type(screen.getByLabelText('6-digit code'), '424242');
    await user.type(await screen.findByLabelText('New password'), 'Fresh-Leaf-2026');
    await user.type(screen.getByLabelText('Confirm new password'), 'Fresh-Leaf-2026');
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(
      await screen.findByText('Password updated. Log in with your new password.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/password/forgot',
        '/api/v1/auth/password/forgot/verify',
        '/api/v1/auth/password/reset',
      ]),
    );
    expect(calls.find(([url]) => url.endsWith('/forgot'))?.[1]).toEqual({
      identifier: 'IPS-2026-0001',
      email: 'nakshiketh28@gmail.com',
    });
  });

  it('an expired reset offers to start again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/password/forgot')) return json({ message: 'sent', challengeId: 'r' });
        if (url.endsWith('/forgot/verify')) return json({ message: 'ok' });
        if (url.endsWith('/password/reset')) {
          return json(
            { code: 'RESET_EXPIRED', message: 'This reset has expired. Request a new code.' },
            400,
          );
        }
        return json({});
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <App />
      </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText('Member ID or username'), 'someone');
    await user.type(screen.getByLabelText('Registered email'), 'a@b.org');
    await user.click(screen.getByRole('button', { name: 'Send verification code' }));
    await user.type(await screen.findByLabelText('6-digit code'), '111111');
    await user.type(await screen.findByLabelText('New password'), 'Fresh-Leaf-2026');
    await user.type(screen.getByLabelText('Confirm new password'), 'Fresh-Leaf-2026');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(
      await screen.findByText('This reset has expired. Request a new code.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(await screen.findByLabelText('Registered email')).toBeInTheDocument();
  });
});

describe('server refusals', () => {
  it('keep their own code and words even when the status is 5xx', async () => {
    const { AuthError, verifyCardImage } = await import('@/services/auth');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            code: 'OTP_SEND_FAILED',
            message: "We couldn't send the verification email. Try again in a moment.",
          },
          503,
        ),
      ),
    );
    const failure = await verifyCardImage(new Blob(['x'], { type: 'image/png' })).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AuthError);
    expect((failure as InstanceType<typeof AuthError>).code).toBe('OTP_SEND_FAILED');
  });

  it('a 5xx with no code of ours is the server falling over', async () => {
    const { verifyCardImage, SERVER_ERROR } = await import('@/services/auth');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    );
    const failure = (await verifyCardImage(new Blob(['x'])).catch((error: unknown) => error)) as {
      code: string;
    };
    expect(failure.code).toBe(SERVER_ERROR);
  });
});
