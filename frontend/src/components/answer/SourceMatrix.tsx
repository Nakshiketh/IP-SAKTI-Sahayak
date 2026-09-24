import { useTranslation } from 'react-i18next';

import type { Citation } from '@/types/domain';

/**
 * Every document behind the answer, side by side.
 *
 * The comparison the conflict matrix cannot make: which legal system a source
 * belongs to, which provision it is, and — the column that matters — how far it
 * has been checked and when a person last confirmed it. A source list that gave
 * only titles would let a fetched-but-unread document sit next to one somebody
 * has read against the original, looking identical.
 *
 * Wide screens get a table because that is what a comparison is. Narrow screens
 * get the same fields stacked, because a six-column table on a phone is a
 * horizontal scroll nobody performs.
 */

/**
 * The review states the registry can report, as literals.
 *
 * `review_state` is typed as a string over the wire, so building the key inline
 * would type-check against any string and render a raw key on a typo. An
 * unrecognised state reads as unverified, which is the safe direction.
 */
const REVIEW_STATE = {
  verified_official: 'provenance.reviewState.verified_official',
  human_reviewed: 'provenance.reviewState.human_reviewed',
  needs_review: 'provenance.reviewState.needs_review',
  unverified: 'provenance.reviewState.unverified',
  superseded: 'provenance.reviewState.superseded',
  unavailable: 'provenance.reviewState.unavailable',
} as const;

function ReviewState({ citation }: { citation: Citation }) {
  const { t } = useTranslation('sahayak');
  const key = REVIEW_STATE[citation.review_state as keyof typeof REVIEW_STATE];
  return <>{t(key ?? REVIEW_STATE.unverified)}</>;
}

export function SourceMatrix({
  citations,
  className,
}: {
  citations: Citation[];
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  if (citations.length === 0) return null;

  // One row per document, not per passage: a document cited three times is one
  // thing to check, and three identical rows would overstate the evidence.
  const byDocument = new Map<string, Citation>();
  for (const citation of citations) {
    if (!byDocument.has(citation.document_id)) byDocument.set(citation.document_id, citation);
  }
  const rows = [...byDocument.values()];

  const columns = [
    t('sourceMatrix.columns.document'),
    t('sourceMatrix.columns.authority'),
    t('sourceMatrix.columns.jurisdiction'),
    t('sourceMatrix.columns.section'),
    t('sourceMatrix.columns.status'),
    t('sourceMatrix.columns.reviewed'),
  ];

  return (
    <section aria-labelledby="source-matrix-heading" className={className}>
      <h3 id="source-matrix-heading" className="text-md">
        {t('sourceMatrix.heading')}
      </h3>
      <p className="mt-1 max-w-measure text-sm text-muted">{t('sourceMatrix.standfirst')}</p>

      <div className="mt-3 hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule-strong text-left">
              {columns.map((column) => (
                <th key={column} scope="col" className="py-2 pr-4 text-xs font-normal text-muted">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((citation) => (
              <tr key={citation.document_id} className="border-b border-rule align-top">
                <td className="py-2.5 pr-4">{citation.document_title}</td>
                <td className="py-2.5 pr-4">{citation.organization}</td>
                <td className="py-2.5 pr-4">{tc(`jurisdiction.${citation.jurisdiction}`)}</td>
                <td className="py-2.5 pr-4">{citation.section_label ?? '—'}</td>
                <td className="py-2.5 pr-4">
                  <ReviewState citation={citation} />
                </td>
                <td className="py-2.5">{citation.reviewed_at ?? t('sourceMatrix.notReviewed')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-3 sm:hidden">
        {rows.map((citation) => (
          <li
            key={citation.document_id}
            className="rounded-card border border-rule bg-surface p-3 text-sm"
          >
            <p>{citation.document_title}</p>
            <p className="mt-1 text-xs text-muted">{citation.organization}</p>
            <dl className="mt-2 space-y-1 text-xs">
              <div>
                <dt className="inline text-muted">{t('sourceMatrix.columns.jurisdiction')}: </dt>
                <dd className="inline">{tc(`jurisdiction.${citation.jurisdiction}`)}</dd>
              </div>
              <div>
                <dt className="inline text-muted">{t('sourceMatrix.columns.status')}: </dt>
                <dd className="inline">
                  <ReviewState citation={citation} />
                </dd>
              </div>
              <div>
                <dt className="inline text-muted">{t('sourceMatrix.columns.reviewed')}: </dt>
                <dd className="inline">{citation.reviewed_at ?? t('sourceMatrix.notReviewed')}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
