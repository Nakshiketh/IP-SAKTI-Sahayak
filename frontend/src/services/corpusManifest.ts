import manifest from '@corpus/manifest.json';

import type { DocumentType, Jurisdiction, VerificationStatus } from '@/types/domain';

/**
 * The planned source set, read from corpus/manifest.json.
 *
 * Nothing in it has been fetched yet. That is the point: the manifest lets the
 * interface name the document a statement *will* cite, and mark the statement
 * pending until the ingestion pipeline has actually retrieved it. A page that
 * asserted these statements without that marking would be claiming authority it
 * does not have.
 *
 * A document counts as fetched when it has a `retrieved_at`. `verification_status`
 * is a separate, stricter question answered by a person.
 */
export interface ManifestDocument {
  document_id: string;
  title: string;
  short_title: string | null;
  organization: string;
  jurisdiction: Jurisdiction;
  regime_family: string;
  document_type: DocumentType;
  source_url: string | null;
  effective_from: string | null;
  retrieved_at: string | null;
  verification_status: VerificationStatus;
}

interface Manifest {
  corpus_version: string;
  documents: ManifestDocument[];
}

const typed = manifest as unknown as Manifest;

export const CORPUS_VERSION = typed.corpus_version;
export const CORPUS_DOCUMENTS: readonly ManifestDocument[] = typed.documents;

const BY_ID = new Map(typed.documents.map((doc) => [doc.document_id, doc]));

export type DocumentId = string;

export function findDocument(id: DocumentId): ManifestDocument | undefined {
  return BY_ID.get(id);
}

/** Has the ingestion pipeline actually retrieved this document? */
export function isFetched(doc: ManifestDocument): boolean {
  return doc.retrieved_at !== null;
}

/** The label to show for a document: its short title where it has one. */
export function documentLabel(doc: ManifestDocument): string {
  return doc.short_title ?? doc.title;
}
