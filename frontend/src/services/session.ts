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
