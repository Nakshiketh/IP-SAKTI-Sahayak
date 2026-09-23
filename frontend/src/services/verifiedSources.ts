// The document list only; the passages live in knowledge-base.json, which
// only the pages that show an answer load.
import sources from '@corpus/guidance/sources.json';

import type { Jurisdiction } from '@/types/domain';

/**
 * The official documents and portals Ask Sahayak answers from.
 *
 * Read from `corpus/guidance/sources.json`, the same file the API
 * serves, so the sources page lists exactly what an answer can cite — each with
 * the official URL it was checked against and the date it was checked.
 */

export interface VerifiedDocument {
  document_id: string;
  document_title: string;
  organization: string;
  jurisdiction: Jurisdiction;
  document_type: string;
  source_url: string;
  version_label?: string;
}

export const VERIFIED_DOCUMENTS = sources.documents as unknown as readonly VerifiedDocument[];
export const VERIFIED_REVIEWED_ON: string = sources.reviewed_on;
export const VERIFIED_CORPUS_VERSION: string = sources.corpus_version;

/**
 * Where a planned full-text document is already covered by a verified one.
 * Keyed by `corpus/manifest.json` id; most share their id, a few are published
 * under a different title or bundled with another instrument.
 */
const MANIFEST_ALIASES: Record<string, string> = {
  'in-tkdl-access-model': 'in-tkdl',
  'intl-madrid-protocol': 'intl-madrid',
  'intl-hague-agreement': 'intl-hague',
  'in-drugs-and-cosmetics-act-1940': 'in-drugs-and-cosmetics-act-rules',
  'in-drugs-and-cosmetics-rules-1945': 'in-drugs-and-cosmetics-act-rules',
  'in-ayurvedic-pharmacopoeia': 'in-pcimh',
  'in-ayurvedic-formulary': 'in-pcimh',
};

const BY_ID = new Map(VERIFIED_DOCUMENTS.map((document) => [document.document_id, document]));

/** A verified document by its own id. Throws on an unknown id: a link to nothing is worse than none. */
export function verifiedDocument(id: string): VerifiedDocument {
  const document = BY_ID.get(id);
  if (!document) throw new Error(`Unknown verified source "${id}" in corpus/guidance/sources.json`);
  return document;
}

export function verifiedFor(manifestId: string): VerifiedDocument | undefined {
  return BY_ID.get(MANIFEST_ALIASES[manifestId] ?? manifestId);
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
