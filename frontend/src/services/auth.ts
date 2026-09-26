/**
 * The member sign-in surface.
 *
 * The session is an HttpOnly cookie the API sets and clears. This module never
 * sees it, never stores anything, and learns who is signed in only by asking
 * `GET /api/v1/auth/me`. That is the point: a script injected into the page
 * has no token to steal.
 *
 * There is no registration. Members are issued by whoever runs the deployment.
 */

import { apiFetch } from '@/lib/http';

export interface Member {
  name: string;
  role: string;
  institution: string;
  memberId: string;
  restricted: boolean;
}

/** Where to go after a successful sign-in or password change. */
export type NextStep = 'change-password' | 'dashboard';

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;
  /** Extra fields the server sent beside the message, e.g. `attemptsRemaining`. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: string,
    status: number,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Codes the portal words itself, rather than showing the server's message. */
export const NETWORK_ERROR = 'unreachable';
export const SERVER_ERROR = 'server_error';

async function post<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, {
      method: 'POST',
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': body instanceof Blob ? body.type : 'application/json' },
            body: body instanceof Blob ? body : JSON.stringify(body),
          }),
    });
  } catch {
    throw new AuthError('', NETWORK_ERROR, 0);
  }

  if (response.status === 204) return undefined as T;

  // An error page or a misrouted proxy can answer with HTML; parse defensively.
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : null;
    // A 5xx without one of this API's codes is the server falling over; one
    // with a code (e.g. OTP_SEND_FAILED) is a refusal with its own sentence.
    if (response.status >= 500 && code === null) {
      throw new AuthError('', SERVER_ERROR, response.status);
    }
    const message = typeof payload.message === 'string' ? payload.message : '';
    throw new AuthError(message, code ?? 'error', response.status, payload);
  }
  return payload as T;
}

export async function logIn(identifier: string, password: string): Promise<NextStep> {
  const { next } = await post<{ next: NextStep }>('/api/v1/auth/login', {
    identifier,
    password,
  });
  return next;
}

/** Who a recognised card belongs to, as the server read it. */
export interface MemberCard {
  name: string;
  role: string;
  institution: string;
  memberId: string;
}

export interface CardChallenge {
  challengeId: string;
  member: MemberCard;
  maskedEmail: string;
  /** Unix seconds. */
  resendAvailableAt: number;
}

/**
 * Show a member card to the camera: one frame or photo, as a JPEG, PNG or WebP
 * blob. A recognised card starts a sign-in and emails a code; the answer says
 * whose card it is. Refusals: `no_code`, `QR_INVALID`, `QR_REVOKED`,
 * `MEMBER_INACTIVE`, `OTP_SEND_FAILED`.
 */
export function verifyCardImage(image: Blob): Promise<CardChallenge> {
  return post<CardChallenge>('/api/v1/auth/qr/verify', image);
}

/** The emailed code for a card sign-in. `OTP_INCORRECT` carries `attemptsRemaining`. */
export async function verifyLoginCode(challengeId: string, code: string): Promise<NextStep> {
  const { next } = await post<{ next: NextStep }>('/api/v1/auth/otp/verify', {
    challengeId,
    code,
  });
  return next;
}

/** A new code for the same sign-in or reset. Returns when the next one may be asked for. */
export async function resendCode(challengeId: string): Promise<number> {
  const { resendAvailableAt } = await post<{ resendAvailableAt: number }>(
    '/api/v1/auth/otp/resend',
    { challengeId },
  );
  return resendAvailableAt;
}

/** Start a reset. The answer never says whether the details matched a member. */
export function forgotPassword(
  identifier: string,
  email: string,
): Promise<{ message: string; challengeId: string }> {
  return post('/api/v1/auth/password/forgot', { identifier, email });
}

export async function verifyResetCode(challengeId: string, code: string): Promise<void> {
  await post('/api/v1/auth/password/forgot/verify', { challengeId, code });
}

export async function resetPassword(newPassword: string, confirmPassword: string): Promise<void> {
  await post('/api/v1/auth/password/reset', { newPassword, confirmPassword });
}

export async function changePassword(input: {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<NextStep> {
  const { next } = await post<{ next: NextStep }>('/api/v1/auth/password/change', input);
  return next;
}

export async function logOut(): Promise<void> {
  try {
    await post<void>('/api/v1/auth/logout');
  } catch {
    /* The cookie may already be gone; the page signs out either way. */
  }
}

/**
 * Who is signed in, if anyone.
 *
 * Three answers, because "nobody" and "could not ask" are different facts. An
 * unreachable server is not evidence the session ended.
 */
export type SessionCheck =
  { state: 'member'; member: Member } | { state: 'anonymous' } | { state: 'unknown' };

export async function checkSession(): Promise<SessionCheck> {
  let response: Response;
  try {
    response = await apiFetch('/api/v1/auth/me');
  } catch {
    return { state: 'unknown' };
  }
  if (response.status === 401) return { state: 'anonymous' };
  if (!response.ok) return { state: 'unknown' };
  try {
    return { state: 'member', member: (await response.json()) as Member };
  } catch {
    return { state: 'unknown' };
  }
}
