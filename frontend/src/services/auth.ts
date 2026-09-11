/**
 * The auth surface: three ways in, one way out.
 *
 * Everything here talks to `/api/v1/auth/*` on the same origin the rest of the
 * app uses, so there is one deployment story rather than two.
 *
 * The token lives in `sessionStorage` rather than `localStorage`. It should not
 * outlive the tab, and `localStorage` is readable by every script on the origin
 * for as long as the browser keeps it. The right answer for a real deployment
 * is an httpOnly cookie the server sets, and this module is the only thing that
 * would have to change — nothing above it touches storage.
 */

export interface AuthUser {
  name: string;
  username: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = 'sahayak.auth.token';
const USER_KEY = 'sahayak.auth.user';

async function post(path: string, body: unknown): Promise<AuthSession> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': body instanceof Blob ? body.type : 'application/json' },
      body: body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new AuthError(
      'Could not reach the server. Check your connection and try again.',
      'unreachable',
      0,
    );
  }

  // An error page or a misrouted proxy can answer with HTML. Parsing
  // defensively keeps a JSON parser message away from the reader.
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    // FastAPI's own validation errors arrive under `detail`; this app's
    // `ApiError` arrives as `code` and `message`. Both have to read well.
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : 'That did not work. Check the details and try again.';
    const code = typeof payload.code === 'string' ? payload.code : 'error';
    throw new AuthError(message, code, response.status);
  }

  return payload as unknown as AuthSession;
}

export const signIn = (username: string, password: string): Promise<AuthSession> =>
  post('/api/v1/auth/login', { username, password });

export const registerAccount = (input: {
  name: string;
  email: string;
  username: string;
  password: string;
}): Promise<AuthSession> => post('/api/v1/auth/register', input);

/**
 * Show the authorised QR code: one camera frame or photo, as a JPEG, PNG or WebP
 * blob. The API answers with a session, `no_code` (no QR code in view) or
 * `invalid_qr` (a QR code, but not the authorised one).
 */
export const signInWithBadgeImage = (image: Blob): Promise<AuthSession> =>
  post('/api/v1/auth/badge', image);

export function storeSession(session: AuthSession): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, session.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(session.user));
  } catch {
    /* storage refused; the session lasts as long as the page does */
  }
}

export function readStoredSession(): AuthSession | null {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const raw = sessionStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    return { token, user: JSON.parse(raw) as AuthUser };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Ask the server whether a stored token is still worth anything.
 *
 * Three answers, not two, because "the server said no" and "I could not ask"
 * are different facts. The signing secret is generated per process, so a
 * restart really does invalidate every token and a reader should be sent back
 * to the front door. But a dropped connection is not evidence of anything, and
 * signing someone out because their wifi blinked would be a bug wearing the
 * costume of a security measure.
 */
export type SessionCheck =
  { state: 'valid'; user: AuthUser } | { state: 'invalid' } | { state: 'unknown' };

export async function verifySession(token: string): Promise<SessionCheck> {
  let response: Response;
  try {
    response = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { state: 'unknown' };
  }

  // Only the server actually rejecting the token ends the session.
  if (response.status === 401 || response.status === 403) return { state: 'invalid' };
  if (!response.ok) return { state: 'unknown' };

  try {
    return { state: 'valid', user: (await response.json()) as AuthUser };
  } catch {
    return { state: 'unknown' };
  }
}
