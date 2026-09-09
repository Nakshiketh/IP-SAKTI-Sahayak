/**
 * What the interface does when things go wrong.
 *
 * Three failures with three different honest answers: the interface breaking,
 * the network being gone, and a request that never reached the server. The one
 * thing none of them may do is read as the product declining to answer — an
 * abstention is the product working, and a reader who cannot tell the two apart
 * will believe something was withheld from them.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { OfflineNotice } from '@/components/layout/OfflineNotice';
import common from '@/locales/en/common.json';
import { isConnectionFailure, isOffline, withBackoff } from '@/services/retry';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  setOnline(true);
  vi.restoreAllMocks();
});

describe('the error boundary', () => {
  function Boom(): never {
    throw new Error('render failed');
  }

  beforeEach(() => {
    // React logs the caught error itself. Silencing it keeps the expected
    // failure from looking like a real one in the run output.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('says the interface broke, not that an answer was withheld', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(common.boundary.title)).toBeInTheDocument();
    expect(screen.getByText(common.boundary.notAnAbstention)).toBeInTheDocument();
  });

  it('offers both recoveries, because the two failures are different', () => {
    // Re-rendering fixes a transient fault. Leaving is the only way out of a
    // page that breaks every time, and offering only a reload would trap a
    // reader on that one.
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: common.boundary.retry })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: common.notFound.action })).toBeInTheDocument();
  });

  it('renders its children when nothing throws', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <p>The page</p>
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('The page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recovers in place when the retry is taken', async () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('transient');
      return <p>Recovered</p>;
    }

    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Flaky />
        </ErrorBoundary>
      </MemoryRouter>,
    );

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: common.boundary.retry }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('sends nothing anywhere', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    // There is no error-reporting service in this product, and the privacy page
    // says so. A boundary that quietly posted the failure would make it false.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('the offline notice', () => {
  it('shows nothing while there is a connection', () => {
    setOnline(true);
    render(<OfflineNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says what is gone and what still works', () => {
    setOnline(false);
    render(<OfflineNotice />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(common.offline.title);
    expect(notice).toHaveTextContent(common.offline.body);
  });

  it('takes nothing away: there is no dismiss and no dialog', () => {
    // A reader who lost their connection has not done anything wrong and should
    // not have to acknowledge it.
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears itself when the connection comes back', () => {
    setOnline(false);
    render(<OfflineNotice />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    setOnline(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('retrying', () => {
  it('retries a request that never reached the server', async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue('answered');

    await expect(withBackoff(attempt, { waits: [0] })).resolves.toBe('answered');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('never retries a failure the server produced', async () => {
    // A 500 means the request arrived and failed inside the server. Trying
    // again would ask the same question twice: a second audit row, and on a
    // deployment with a hosted model, a second billed call.
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('server said 500'));

    await expect(withBackoff(attempt, { waits: [0, 0] })).rejects.toThrow('server said 500');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('never retries a request the reader cancelled', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(abort);

    await expect(withBackoff(attempt, { waits: [0] })).rejects.toBe(abort);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('gives up rather than retrying forever, and reports the real failure', async () => {
    const failure = new TypeError('Failed to fetch');
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(withBackoff(attempt, { waits: [0, 0] })).rejects.toBe(failure);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('stops waiting once the reader has navigated away', async () => {
    const controller = new AbortController();
    const attempt = vi.fn<() => Promise<string>>().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    await expect(
      withBackoff(attempt, { signal: controller.signal, waits: [0, 0] }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('tells a connection failure apart from everything else', () => {
    expect(isConnectionFailure(new TypeError('Failed to fetch'))).toBe(true);
    expect(isConnectionFailure(new Error('500'))).toBe(false);
    expect(isConnectionFailure(new DOMException('x', 'AbortError'))).toBe(false);
  });

  it('trusts navigator.onLine only when it says no', () => {
    setOnline(false);
    expect(isOffline()).toBe(true);
    setOnline(true);
    expect(isOffline()).toBe(false);
  });
});
