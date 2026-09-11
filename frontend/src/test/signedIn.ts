/**
 * Put a session in place, for tests about something other than signing in.
 *
 * Every route now sits behind the front door, so a test that renders `<App />`
 * to assert on a page has to say who is looking at it. This writes the same two
 * keys `services/auth.ts` writes, so the provider finds a session exactly as it
 * would in a browser.
 *
 * The server check that follows is allowed to fail: `verifySession` reports an
 * unreachable server as `unknown`, and an unknown answer leaves the stored
 * session standing. So a test needs no fetch stub unless it is specifically
 * about a token being rejected.
 */
export function signInForTest(
  user = { name: 'Demo User', username: 'demo', email: 'demo@example.com' },
): void {
  sessionStorage.setItem('sahayak.auth.token', 'test-token');
  sessionStorage.setItem('sahayak.auth.user', JSON.stringify(user));
}

export function signOutForTest(): void {
  sessionStorage.removeItem('sahayak.auth.token');
  sessionStorage.removeItem('sahayak.auth.user');
}
