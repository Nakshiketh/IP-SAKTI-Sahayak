/**
 * A session id, for rate limiting and for tying an answer to the feedback about
 * it. Not a user id, and deliberately not durable.
 *
 * It lives in `sessionStorage`, so it dies with the tab. Nothing about a reader
 * survives that, which is the point: the product has no accounts, and an
 * identifier that outlived the tab would be one anyway. Where storage is
 * unavailable — a private window with it disabled — a fresh id is minted per
 * call, which costs the rate limiter some precision and costs the reader
 * nothing.
 */

const KEY = 'sahayak.session';

function mint(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return existing;
    const minted = mint();
    window.sessionStorage.setItem(KEY, minted);
    return minted;
  } catch {
    return mint();
  }
}

/**
 * Throw this session away. The next call to `sessionId` mints a new one.
 *
 * This is the whole of the deletion path the privacy page offers, and it is a
 * complete one rather than a gesture. The audit holds no identity, no address
 * and no question text, so the only thing tying one row to another is this id —
 * and it lives in this tab and nowhere else.
 */
export function discardSession(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable in a private window. Nothing was kept there
    // either, so there is nothing to discard and nothing to report.
  }
}
