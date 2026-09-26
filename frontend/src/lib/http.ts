/**
 * Every request to this app's own API, with the two things a session needs.
 *
 * - **The CSRF header.** The session is an HttpOnly cookie the browser attaches
 *   by itself, so the API refuses a state-changing request unless it carries
 *   `X-Sahayak-CSRF: 1` — a header a form on another site cannot send.
 * - **Noticing a session has ended.** A 401 from anything but the sign-in
 *   endpoints means the session expired or was revoked elsewhere, and a 403
 *   `password_change_required` means it is restricted. Either is announced as a
 *   window event the auth provider listens for, so no caller has to know what
 *   to do about it.
 *
 * Nothing here reads or stores a token: there is none the page can see.
 */

export const CSRF_HEADERS: Readonly<Record<string, string>> = { 'X-Sahayak-CSRF': '1' };

export const SESSION_EVENT = 'sahayak:session';
export type SessionEventDetail = 'expired' | 'restricted';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function announce(detail: SessionEventDetail): void {
  window.dispatchEvent(new CustomEvent<SessionEventDetail>(SESSION_EVENT, { detail }));
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string> | undefined) ?? {}),
    ...(SAFE_METHODS.has(method) ? {} : CSRF_HEADERS),
  };
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });

  if (!path.startsWith('/api/v1/auth/')) {
    if (response.status === 401) announce('expired');
    else if (response.status === 403) {
      try {
        const body = (await response.clone().json()) as { code?: unknown };
        if (body.code === 'password_change_required') announce('restricted');
      } catch {
        /* not JSON; not a session answer */
      }
    }
  }
  return response;
}
