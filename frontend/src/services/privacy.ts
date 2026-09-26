import { useCallback, useEffect, useState } from 'react';

import { apiMode } from '@/services/query';
import { sessionId } from '@/services/session';
import { apiFetch } from '@/lib/http';

/**
 * Consent, the access log, and the audit rows.
 *
 * The privacy page is the one page in this product that must not contain a
 * single sentence somebody typed and forgot. Every claim it makes about what is
 * held is answered from here, from the running system: which sources would need
 * the reader's own credentials (the manifest), what this session has agreed to
 * and when (the access log), and what columns an audit row actually has (the
 * schema). A page that asserted those in prose would be asking to be believed.
 */

export interface ConsentEvent {
  sourceId: string;
  sourceName: string;
  granted: boolean;
  /** ISO timestamp, as the server recorded it. Never re-derived here. */
  recordedAt: string;
}

export interface CredentialedSource {
  document_id: string;
  title: string;
  short_title: string | null;
  organization: string;
  jurisdiction: string;
}

export interface AccessLog {
  events: ConsentEvent[];
  /** Source ids currently allowed — the latest decision for each. */
  granted: string[];
  /**
   * Sources that would need consent at all. Empty in the current source set,
   * and the page says exactly that rather than implying a gate nobody has met.
   */
  credentialedSources: CredentialedSource[];
}

export const EMPTY_ACCESS_LOG: AccessLog = {
  events: [],
  granted: [],
  credentialedSources: [],
};

function headers(): HeadersInit {
  return { 'content-type': 'application/json', 'x-session-id': sessionId() };
}

/**
 * Accept a response only if it is one.
 *
 * Same reason as the evaluation summary: a misrouted proxy returning another
 * endpoint's JSON must read as "nothing to show", not take the page down. On
 * this page in particular, rendering a half-understood body could show a reader
 * a consent they never gave.
 */
function isAccessLog(value: unknown): value is AccessLog {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AccessLog>;
  return (
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.granted) &&
    Array.isArray(candidate.credentialedSources)
  );
}

export type AccessLogState =
  { state: 'loading' } | { state: 'ready'; log: AccessLog } | { state: 'unavailable' };

/**
 * This session's consent history.
 *
 * With no API running there is still something true to show: nothing has been
 * agreed to, because nothing could have been. That is the same answer the live
 * endpoint gives today, so the mock is not standing in for a different reality.
 */
export function useAccessLog(): AccessLogState & { refresh: () => void } {
  const [value, setValue] = useState<AccessLogState>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (apiMode() === 'mock') {
      setValue({ state: 'ready', log: EMPTY_ACCESS_LOG });
      return;
    }
    const controller = new AbortController();
    apiFetch('/api/v1/access-log', { headers: headers(), signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        if (!isAccessLog(body)) throw new Error('malformed access log');
        setValue({ state: 'ready', log: body });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setValue({ state: 'unavailable' });
      });
    return () => controller.abort();
  }, [nonce]);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);
  return { ...value, refresh };
}

/**
 * Record a decision about one named source.
 *
 * Resolves to what the server said it did. Never optimistic: the access log is
 * a record of what happened, and showing a grant the server refused would make
 * it a record of what the interface hoped for.
 */
export async function recordConsent(sourceId: string, granted: boolean): Promise<string> {
  const response = await apiFetch('/api/v1/consent', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ source_id: sourceId, granted, session_id: sessionId() }),
  });
  const body = (await response.json()) as { note?: string; message?: string };
  if (!response.ok) throw new Error(body.message ?? `consent returned ${response.status}`);
  return body.note ?? '';
}

/**
 * The deletion path, re-exported so the privacy page has one import.
 *
 * The language choice is deliberately not touched by it. That is a preference
 * the reader set, not a record of what they asked, and silently resetting it
 * would be a worse surprise than leaving it alone.
 */
export { discardSession } from '@/services/session';
