/**
 * Retrying, and the narrow case where it is safe.
 *
 * A retry is only correct when the first attempt certainly did not happen. That
 * rules out most of what looks retryable: a 500 means the server received the
 * request and failed inside it, a 503 means it received the request and refused
 * it, and a timeout means nobody knows. Retrying any of those risks doing the
 * work twice — a second audit row for a question the reader asked once, and on a
 * deployment with a hosted model, a second billed call.
 *
 * What is left is a `fetch` that rejects before a response exists: the
 * connection was refused, the name did not resolve, the network was not there.
 * Those did not reach the server, so trying again is the same request rather
 * than a second one. `isConnectionFailure` is what draws that line, and it is
 * deliberately narrow.
 *
 * The waits are short and few. This is for the case where a reader's phone
 * changed cell between the tap and the request, not for riding out an outage —
 * a page that silently retries for half a minute is a page that looks broken
 * while claiming to be working.
 */

/** Milliseconds to wait before each retry. Three attempts in total. */
export const BACKOFF_MS = [300, 900] as const;

/**
 * Did this fail before reaching the server?
 *
 * `fetch` rejects with a TypeError for a connection-level failure and with an
 * AbortError when the caller cancelled. Only the first is retryable, and an
 * abort is a decision the reader made rather than a fault.
 */
export function isConnectionFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  return error instanceof TypeError;
}

/** Is the browser telling us there is no network? */
export function isOffline(): boolean {
  // `onLine` is false only when the browser is certain. True does not mean
  // reachable, which is why a failed request is still reported as a failure
  // rather than as "you are online, so it worked".
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Run `attempt`, retrying only a failure that never reached the server.
 *
 * Rethrows the last error once the attempts are used up, so the caller reports
 * the real failure rather than a wrapper that hides which one it was.
 */
export async function withBackoff<T>(
  attempt: () => Promise<T>,
  options: { signal?: AbortSignal | undefined; waits?: readonly number[] } = {},
): Promise<T> {
  const waits = options.waits ?? BACKOFF_MS;
  let last: unknown;

  for (let index = 0; index <= waits.length; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
      if (!isConnectionFailure(error)) throw error;
      if (index === waits.length) break;
      // A reader who has navigated away should not be waited on.
      if (options.signal?.aborted) throw error;
      await sleep(waits[index]!);
      if (options.signal?.aborted) throw error;
    }
  }

  throw last;
}
