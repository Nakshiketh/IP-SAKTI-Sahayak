import type { Record_ } from '@/types/domain';

/**
 * Layer 2, from the API.
 *
 * A separate module from `query.ts` because they are separate questions with
 * separate authority: one asks what is required, the other what has been filed.
 * Nothing here returns an answer, and nothing in `query.ts` returns a record.
 *
 * The portal list is the honest half of this. Those registries are interactive
 * and their terms generally forbid automated retrieval, so the product links out
 * rather than claiming to have looked. Every row carries `notSearchedHere`, sent
 * by the API so the interface never has to infer it.
 */

export interface RecordsSearchResult {
  records: Record_[];
  total: number;
  /** How many records exist at all, so an empty result can say which kind it is. */
  recordCount: number;
  ingested: boolean;
  note: string;
}

export interface PortalLink {
  sourceId: string;
  name: string;
  publisher: string;
  jurisdiction: string;
  recordType: string;
  /** Null until somebody has verified this portal's URL structure. */
  url: string | null;
  termsNote: string;
  notSearchedHere: boolean;
}

export interface RecordsSourceRow {
  sourceId: string;
  name: string;
  publisher: string;
  jurisdiction: string;
  recordType: string;
  accessMode: string;
  licence: string | null;
  licenceUrl: string | null;
  attributionText: string | null;
  termsNote: string;
  citableInAnswers: false;
  ingested: boolean;
  recordCount: number;
  lastSnapshotAt: string | null;
  linkTemplateVerified: boolean;
}

export interface RecordsSourcesResult {
  recordsVersion: string;
  sources: RecordsSourceRow[];
  portals: PortalLink[];
  recordCount: number;
  portalCount: number;
  ingestibleCount: number;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, signal ? { signal } : {});
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return (await response.json()) as T;
}

export function searchRecords(
  query: string,
  options: { jurisdiction?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<RecordsSearchResult> {
  const params = new URLSearchParams({ q: query });
  if (options.jurisdiction) params.set('jurisdiction', options.jurisdiction);
  if (options.limit) params.set('limit', String(options.limit));
  return get<RecordsSearchResult>(`/api/v1/records/search?${params}`, options.signal);
}

/**
 * The registries this product does not search, with the reader's question
 * already in the link where a template has been verified.
 */
export function recordsSources(
  query?: string,
  signal?: AbortSignal,
): Promise<RecordsSourcesResult> {
  const params = query ? `?${new URLSearchParams({ q: query })}` : '';
  return get<RecordsSourcesResult>(`/api/v1/records/sources${params}`, signal);
}
