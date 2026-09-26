/**
 * The demo member card, as the API describes it.
 *
 * Only there when the instance runs with ENABLE_DEMO_CARD on outside
 * production; anything else is a 404 and the page renders "not found". The QR
 * image is the file `issue-card` wrote, served as it is, so nothing here draws
 * or holds a token.
 */

export interface DemoCard {
  name: string;
  role: string;
  institution: string;
  memberId: string;
  /** ISO date, e.g. 2026-09-26. */
  issuedOn: string;
}

export const CARD_QR_URL = '/api/v1/demo/member-card/qr.png';

export type DemoCardResult =
  | { state: 'ready'; card: DemoCard }
  | { state: 'absent' }
  | { state: 'unavailable'; message: string };

export async function fetchDemoCard(signal?: AbortSignal): Promise<DemoCardResult> {
  let response: Response;
  try {
    response = await fetch('/api/v1/demo/member-card', signal ? { signal } : {});
  } catch {
    return { state: 'unavailable', message: '' };
  }
  if (response.status === 404) {
    // A missing image or card says what to run; a switched-off feature says nothing.
    try {
      const body = (await response.json()) as { code?: string; message?: string };
      if (body.code === 'card_not_issued' || body.code === 'card_image_missing') {
        return { state: 'unavailable', message: body.message ?? '' };
      }
    } catch {
      /* not ours */
    }
    return { state: 'absent' };
  }
  if (!response.ok) return { state: 'unavailable', message: '' };
  return { state: 'ready', card: (await response.json()) as DemoCard };
}
