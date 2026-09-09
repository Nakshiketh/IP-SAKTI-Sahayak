import { useEffect, useState } from 'react';

/**
 * The audit table, raw. A development surface.
 *
 * Not registered in a production build, and the endpoint behind it refuses to
 * serve outside a development environment, so this cannot be reached from a
 * deployed site even by guessing the path. Two gates rather than one, because
 * either alone would be a route whose safety depends on a build flag.
 *
 * Deliberately untranslated and undesigned. It is a table of what the store
 * actually holds, for somebody checking that the privacy page tells the truth,
 * and dressing it up would make it look like a product feature. The column list
 * comes from the schema that creates the table, so the empty ones are visible:
 * that there is no `question` column is the point of looking.
 */
interface AuditRow {
  id: number;
  recordedAt: string;
  event: string;
  sessionId: string;
  questionHash: string | null;
  jurisdiction: string | null;
  passageIds: string[];
  model: string | null;
  promptVersion: string | null;
  corpusVersion: string | null;
  confidence: string | null;
  abstained: boolean | null;
  abstainReason: string | null;
  neutralisedSpans: number;
  droppedClaims: number;
  latencyMs: number | null;
  detail: Record<string, unknown> | null;
}

interface AuditResponse {
  rows: AuditRow[];
  columns: string[];
}

type State =
  { state: 'loading' } | { state: 'ready'; body: AuditResponse } | { state: 'unavailable' };

export default function AuditLogRoute() {
  const [value, setValue] = useState<State>({ state: 'loading' });

  useEffect(() => {
    document.title = 'Audit log (development)';
    const controller = new AbortController();
    fetch('/api/v1/audit?limit=200', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<AuditResponse>;
      })
      .then((body) => setValue({ state: 'ready', body }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setValue({ state: 'unavailable' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto max-w-[75rem] px-5 py-12">
      <h1 className="text-2xl">Audit log</h1>
      <p className="mt-3 max-w-measure text-base text-muted">
        Every row the running system has appended, newest first. A development view: the endpoint
        refuses to serve outside a development environment, and this route is not registered in a
        production build.
      </p>

      {value.state === 'loading' ? <p className="mt-6 text-base text-muted">Reading.</p> : null}

      {value.state === 'unavailable' ? (
        <p className="mt-6 max-w-measure text-base text-muted">
          The audit endpoint could not be reached. Either the API is not running, or this is not a
          development environment — in which case it is refusing on purpose.
        </p>
      ) : null}

      {value.state === 'ready' ? (
        <>
          <section className="mt-8">
            <h2 className="text-md">Columns a row can hold</h2>
            <p className="mt-2 max-w-measure text-base text-muted">
              Read from the schema that creates the table, not from a list typed here. What is
              absent is the point: there is no column for the question text, the answer text, an
              identity or an address.
            </p>
            <p className="mt-3 max-w-none font-mono text-xs text-muted">
              {value.body.columns.join('  ·  ')}
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-md">{value.body.rows.length} rows</h2>
            {value.body.rows.length === 0 ? (
              <p className="mt-2 max-w-measure text-base text-muted">
                Nothing has been recorded yet. Ask a question and come back.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[64rem] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-rule-strong text-left">
                      {HEADINGS.map((heading) => (
                        <th key={heading} scope="col" className="py-2 pr-3 font-medium text-muted">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {value.body.rows.map((row) => (
                      <tr key={row.id} className="border-b border-rule-faint align-top">
                        <td className="py-2 pr-3 tabular-nums text-muted">{row.recordedAt}</td>
                        <td className="py-2 pr-3">{row.event}</td>
                        <td className="py-2 pr-3 font-mono text-muted">{row.sessionId}</td>
                        <td className="py-2 pr-3 font-mono text-muted">
                          {row.questionHash ?? '—'}
                        </td>
                        <td className="py-2 pr-3">{row.jurisdiction ?? '—'}</td>
                        <td className="py-2 pr-3 tabular-nums">{row.passageIds.length}</td>
                        <td className="py-2 pr-3">{row.model ?? '—'}</td>
                        <td className="py-2 pr-3">{row.corpusVersion ?? '—'}</td>
                        <td className="py-2 pr-3">{row.confidence ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {row.abstained === null ? '—' : row.abstained ? 'yes' : 'no'}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{row.neutralisedSpans}</td>
                        <td className="py-2 pr-3 tabular-nums">{row.droppedClaims}</td>
                        <td className="py-2 pr-3 tabular-nums">{row.latencyMs ?? '—'}</td>
                        <td className="py-2 font-mono text-muted">
                          {row.detail ? JSON.stringify(row.detail) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

const HEADINGS = [
  'recorded at',
  'event',
  'session',
  'question hash',
  'jurisdiction',
  'passages',
  'model',
  'corpus',
  'confidence',
  'abstained',
  'stripped',
  'dropped',
  'ms',
  'detail',
] as const;
