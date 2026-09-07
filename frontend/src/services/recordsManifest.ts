import manifest from '@corpus/records-manifest.json';

import type { Jurisdiction, RecordType } from '@/types/domain';

/**
 * Layer 2 — the records sources.
 *
 * Read only to render the sources page. Nothing here is ingested: no licence has
 * been read, and the corpus policy is that a source with an unverified licence is
 * not fetched. `portal_link_only` sources carry no parser and no link template,
 * so there is nothing for a fetcher to be written against — which is the point.
 */
export type RecordsAccessMode = 'bulk_open' | 'api_open' | 'portal_link_only';

export interface RecordsSource {
  source_id: string;
  name: string;
  publisher: string;
  jurisdiction: Jurisdiction;
  record_type: RecordType;
  access_mode: RecordsAccessMode;
  source_url: string | null;
  licence: string | null;
  licence_url: string | null;
  attribution_text: string | null;
  update_cadence: string;
  last_snapshot_at: string | null;
  record_count: number | null;
  terms_note: string;
  citable_in_answers: false;
  link_template?: string | null;
}

interface RecordsManifest {
  records_version: string;
  sources: RecordsSource[];
}

const typed = manifest as unknown as RecordsManifest;

export const RECORDS_VERSION = typed.records_version;
export const RECORDS_SOURCES: readonly RecordsSource[] = typed.sources;

/** A source is only ingested once someone has read its licence. */
export function isIngested(source: RecordsSource): boolean {
  return source.access_mode !== 'portal_link_only' && source.licence !== null;
}
