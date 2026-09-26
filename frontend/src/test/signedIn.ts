import type { Member, SessionCheck } from '@/services/auth';

/**
 * Put a session in place, for tests about something other than signing in.
 *
 * Every route sits behind the sign-in gate, and the session is an HttpOnly
 * cookie the page cannot see: the app learns who is signed in by asking
 * `GET /api/v1/auth/me`. `test/setup.ts` replaces that one question
 * (`checkSession`) with an answer these two functions control, and leaves the
 * rest of `services/auth` real. Tests are free to stub `fetch` however they
 * like without the gate noticing.
 */

const TEST_MEMBER: Member = {
  name: 'Test Member',
  role: 'Student / Researcher',
  institution: 'Test Institute',
  memberId: 'IPS-TEST-0001',
  restricted: false,
};

let session: SessionCheck = { state: 'anonymous' };

export function signInForTest(member: Partial<Member> = {}): void {
  session = { state: 'member', member: { ...TEST_MEMBER, ...member } };
}

export function signOutForTest(): void {
  session = { state: 'anonymous' };
}

/** What the stand-in `checkSession` answers. */
export function currentTestSession(): SessionCheck {
  return session;
}
