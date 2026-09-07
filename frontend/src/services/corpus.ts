import { useEffect, useState } from 'react';

/**
 * What the source set currently is.
 *
 * The footer states the source count, the as-of date and the corpus version on
 * every page. Those three numbers are read from here and nowhere else — never
 * written into JSX — because the moment a count is typed into a component it
 * stops being true and nobody notices.
 *
 * Today this reads `/api/v1/corpus-version`, which honestly reports zero
 * documents: no corpus is ingested until Phase 11. If the API cannot be reached
 * the footer says the information is unavailable rather than guessing, which is
 * the same rule the answer surface follows.
 */
export interface CorpusStatus {
  corpusVersion: string;
  documentCount: number;
  /** ISO date, or null when nothing has been ingested yet. */
  asOfDate: string | null;
}

export type CorpusStatusState =
  { state: 'loading' } | { state: 'ready'; status: CorpusStatus } | { state: 'unavailable' };

interface CorpusVersionResponse {
  corpus_version: string;
  document_count: number;
  as_of_date: string | null;
}

export async function fetchCorpusStatus(signal?: AbortSignal): Promise<CorpusStatus> {
  const response = await fetch('/api/v1/corpus-version', signal ? { signal } : {});
  if (!response.ok) throw new Error(`corpus-version returned ${response.status}`);
  const body = (await response.json()) as CorpusVersionResponse;
  return {
    corpusVersion: body.corpus_version,
    documentCount: body.document_count,
    asOfDate: body.as_of_date,
  };
}

export function useCorpusStatus(): CorpusStatusState {
  const [value, setValue] = useState<CorpusStatusState>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchCorpusStatus(controller.signal)
      .then((status) => setValue({ state: 'ready', status }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setValue({ state: 'unavailable' });
      });
    return () => controller.abort();
  }, []);

  return value;
}
