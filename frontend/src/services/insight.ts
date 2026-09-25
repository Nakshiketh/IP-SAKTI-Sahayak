import { useCallback, useEffect, useState } from 'react';

import { readStoredSession } from '@/services/auth';

/**
 * System-level numbers, for whoever runs this deployment.
 *
 * Every field mirrors `app/api/insight.py`, which reads the audit log and
 * nothing else. There is deliberately no field here that could hold a question:
 * the audit log stores a hash of one and never the words, and this type is the
 * place a well-meaning addition would first show up.
 *
 * `null` is load-bearing on every rate. It means nobody has asked anything yet,
 * which is not the same as 0%, and a dashboard that rendered 0% would be
 * inventing a figure out of an empty table.
 */
export interface Bucket {
  name: string;
  count: number;
}

export interface Gap {
  reason: string;
  count: number;
}

export interface Insight {
  total_queries: number;
  by_jurisdiction: Bucket[];
  by_language: Bucket[];
  by_abstain_reason: Bucket[];
  most_used_sources: Bucket[];
  knowledge_gaps: Gap[];
  suppressed_buckets: number;
  minimum_bucket: number;
  abstention_rate: number | null;
  escalation_rate: number | null;
  refusal_rate: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  provenance: string;
}

/**
 * Why each refusal is its own state rather than one error string.
 *
 * They need different things from the reader: `disabled` means a deployment
 * turned the dashboard off, `forbidden` means the account is fine but is not an
 * administrator, and `unreachable` means the API is down. Collapsing them into
 * "something went wrong" would leave someone editing the wrong file.
 */
export type InsightState =
  | { state: 'loading' }
  | { state: 'ready'; insight: Insight }
  | { state: 'disabled' }
  | { state: 'forbidden' }
  | { state: 'unreachable' };

export function useInsight(): { result: InsightState; reload: () => void } {
  const [result, setResult] = useState<InsightState>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    const token = readStoredSession()?.token;

    void (async () => {
      let response: Response;
      try {
        response = await fetch('/api/v1/admin/insight', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        if (live) setResult({ state: 'unreachable' });
        return;
      }
      if (!live) return;

      if (response.status === 404) return setResult({ state: 'disabled' });
      if (response.status === 401 || response.status === 403) {
        return setResult({ state: 'forbidden' });
      }
      if (!response.ok) return setResult({ state: 'unreachable' });

      try {
        setResult({ state: 'ready', insight: (await response.json()) as Insight });
      } catch {
        setResult({ state: 'unreachable' });
      }
    })();

    return () => {
      live = false;
    };
  }, [nonce]);

  return { result, reload: useCallback(() => setNonce((n) => n + 1), []) };
}
