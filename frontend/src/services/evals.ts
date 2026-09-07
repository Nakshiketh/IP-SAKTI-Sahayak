import { useEffect, useState } from 'react';

/**
 * The evaluation summary, if there is one.
 *
 * The harness in Phase 13 writes `evals/reports/summary.json` and the build
 * copies it to `public/evals-summary.json`, which this reads at runtime. Until
 * then the fetch 404s and the page says no evaluation has been run.
 *
 * Deliberately a runtime read rather than a build-time import: a missing file
 * must be an ordinary state this page renders, not a build error, and the
 * numbers must be whatever the last run produced rather than whatever was true
 * when someone typed them.
 */
export interface EvalSummary {
  /** ISO date of the run. */
  run_at: string;
  /** Metric name -> its result, already formatted for display. */
  metrics: Record<string, string>;
}

/**
 * Accept a summary only if it is actually one.
 *
 * A malformed or unexpected response is treated exactly like a missing file:
 * the page says no evaluation has been run. The alternative — trusting the shape
 * and rendering whatever comes back — crashed this page when a stubbed fetch
 * returned a different endpoint's JSON, and would do the same in production
 * behind a misrouted proxy.
 */
function isEvalSummary(value: unknown): value is EvalSummary {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EvalSummary>;
  if (typeof candidate.run_at !== 'string') return false;
  if (typeof candidate.metrics !== 'object' || candidate.metrics === null) return false;
  return Object.values(candidate.metrics).every((entry) => typeof entry === 'string');
}

export type EvalSummaryState =
  { state: 'loading' } | { state: 'ready'; summary: EvalSummary } | { state: 'not-run' };

export function useEvalSummary(): EvalSummaryState {
  const [value, setValue] = useState<EvalSummaryState>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/evals-summary.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<unknown>;
      })
      .then((body) => {
        if (!isEvalSummary(body)) throw new Error('malformed evaluation summary');
        setValue({ state: 'ready', summary: body });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setValue({ state: 'not-run' });
      });
    return () => controller.abort();
  }, []);

  return value;
}
