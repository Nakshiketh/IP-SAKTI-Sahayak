import { createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import {
  documentLabel,
  findDocument,
  type DocumentId,
  type ManifestDocument,
} from '@/services/corpusManifest';
import { sourceHost, verifiedFor } from '@/services/verifiedSources';

/**
 * Inline sourcing for a reference page.
 *
 * Every factual statement on `/what-is-covered` carries a marker naming the
 * document it rests on. Until the ingestion pipeline has actually fetched that
 * document, the marker renders in a pending state and the statement is not
 * presented as settled.
 *
 * Two states, and they look different on purpose:
 *
 *   cited    an indigo filled number, the same marker used in an answer, linking
 *            to the document on the sources page.
 *   pending  a muted, dotted-underlined number. The document is named, so the
 *            reader can see what this *will* rest on, but nothing claims it has
 *            been read.
 *
 * A marker whose id is not in the manifest throws. A citation pointing at
 * nothing is worse than no citation, and this is the cheapest place to catch it.
 */

interface SectionSources {
  /** Document id -> its 1-based number within the section. */
  numbering: ReadonlyMap<DocumentId, number>;
  documents: readonly ManifestDocument[];
}

const SourcesContext = createContext<SectionSources | null>(null);

export function SourceScope({
  documentIds,
  children,
}: {
  documentIds: readonly DocumentId[];
  children: React.ReactNode;
}) {
  const value = useMemo<SectionSources>(() => {
    const documents = documentIds.map((id) => {
      const doc = findDocument(id);
      if (!doc) {
        throw new Error(
          `Unknown corpus document "${id}". Add it to corpus/manifest.json, or ` +
            `remove the reference — a citation that resolves to nothing is worse ` +
            `than no citation.`,
        );
      }
      return doc;
    });
    return {
      documents,
      numbering: new Map(documentIds.map((id, index) => [id, index + 1])),
    };
  }, [documentIds]);

  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>;
}

function useSectionSources(): SectionSources {
  const value = useContext(SourcesContext);
  if (!value) throw new Error('<Src> must be used inside a <SourceScope>');
  return value;
}

/** The inline marker. Place it immediately after the sentence it supports. */
export function Src({ doc: id }: { doc: DocumentId }) {
  const { t } = useTranslation('covered');
  const { numbering } = useSectionSources();

  const doc = findDocument(id);
  const number = numbering.get(id);
  if (!doc || number === undefined) {
    throw new Error(`Document "${id}" is not listed in this section's SourceScope`);
  }

  const label = t('marker.cited', { number, title: doc.title });

  return (
    <sup title={label} aria-label={label} className="ml-0.5 text-[0.7em] font-medium text-stamp">
      {number}
    </sup>
  );
}

/** The list of documents a section rests on, rendered at the end of it. */
export function SectionSourceList({ className }: { className?: string }) {
  const { t } = useTranslation('covered');
  const { documents } = useSectionSources();

  return (
    <div className={cn('mt-5 border-t border-rule-faint pt-3', className)}>
      <p className="max-w-none text-xs text-muted">{t('sourceList.heading')}</p>
      <ol className="m-0 mt-1.5 list-none p-0">
        {documents.map((doc, index) => {
          const official = doc.source_url ?? verifiedFor(doc.document_id)?.source_url ?? null;
          return (
            <li key={doc.document_id} className="text-xs text-muted">
              <span className="tabular-nums">{index + 1}.</span> {documentLabel(doc)}
              {official ? (
                <>
                  {' — '}
                  <a
                    href={official}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stamp underline underline-offset-4"
                  >
                    {sourceHost(official)}
                  </a>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
