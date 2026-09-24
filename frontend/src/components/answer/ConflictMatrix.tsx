import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Analysis, Citation, Conflict } from '@/types/domain';

/**
 * What does not sit together, and what the rules made of it.
 *
 * A table on a wide screen because the comparison is the point — you read
 * across a row to see that two obligations are separate rather than opposed.
 * On a phone a five-column table is unreadable, so each row becomes a card with
 * the same fields stacked and labelled.
 *
 * "Separate obligations" is the most common relationship here and the least
 * intuitive, so it is stated rather than implied: two legal systems asking
 * different things of one product is not a contradiction to be resolved.
 */

function sourceName(id: string, citations: Citation[]): string {
  return citations.find((citation) => citation.document_id === id)?.document_title ?? id;
}

/**
 * The explanation keys the engine can emit, listed as literals.
 *
 * The backend types `explanation_key` as a string, so writing the key straight
 * into `t()` would compile against any string and fail silently at runtime on a
 * typo. Listing them here makes the translation keys checked, and an
 * unrecognised key falls back to the generic line rather than rendering raw.
 */
const EXPLANATION = {
  conflictJurisdictional: 'conflicts.explanation.conflictJurisdictional',
  conflictScopeOverlap: 'conflicts.explanation.conflictScopeOverlap',
  conflictAuthority: 'conflicts.explanation.conflictAuthority',
  conflictTemporalSuperseded: 'conflicts.explanation.conflictTemporalSuperseded',
  conflictTemporalLater: 'conflicts.explanation.conflictTemporalLater',
  conflictClassification: 'conflicts.explanation.conflictClassification',
  conflictMissingFact: 'conflicts.explanation.conflictMissingFact',
  conflictTrueSource: 'conflicts.explanation.conflictTrueSource',
} as const;

function Explanation({ conflict }: { conflict: Conflict }) {
  const { t } = useTranslation('sahayak');
  const key = EXPLANATION[conflict.explanation_key as keyof typeof EXPLANATION];
  return <>{key ? t(key) : t('conflicts.explanation.conflictScopeOverlap')}</>;
}

function Relationship({ conflict }: { conflict: Conflict }) {
  const { t } = useTranslation('sahayak');
  const settled = conflict.resolution_status !== 'unresolved';
  return (
    <Badge tone={settled ? 'sourced' : 'caution'}>
      {t(`conflicts.resolution.${conflict.resolution_status}`)}
    </Badge>
  );
}

export function ConflictMatrix({
  analysis,
  citations,
  className,
}: {
  analysis: Analysis;
  citations: Citation[];
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const conflicts = analysis.conflicts;
  if (conflicts.length === 0) return null;

  const columns = [
    t('conflicts.columns.issue'),
    t('conflicts.columns.sourceA'),
    t('conflicts.columns.sourceB'),
    t('conflicts.columns.relationship'),
    t('conflicts.columns.resolution'),
  ];

  return (
    <section aria-labelledby="conflict-matrix-heading" className={className}>
      <h3 id="conflict-matrix-heading" className="text-md">
        {t('conflicts.heading')}
      </h3>
      <p className="mt-1 max-w-measure text-sm text-muted">{t('conflicts.standfirst')}</p>

      {/* Wide: the comparison as a table. */}
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
            {conflicts.map((conflict) => (
              <tr key={conflict.conflict_id} className="border-b border-rule align-top">
                <td className="py-2.5 pr-4">
                  {conflict.issue ? t(`issues.${conflict.issue}`) : t('conflicts.noIssue')}
                </td>
                <td className="py-2.5 pr-4">{sourceName(conflict.source_a, citations)}</td>
                <td className="py-2.5 pr-4">{sourceName(conflict.source_b, citations)}</td>
                <td className="py-2.5 pr-4">
                  <Explanation conflict={conflict} />
                </td>
                <td className="py-2.5">
                  <Relationship conflict={conflict} />
                  {conflict.requires_human_review ? (
                    <p className="mt-1 text-xs text-muted">{t('conflicts.needsReview')}</p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow: the same fields, stacked and labelled. */}
      <ul className="mt-3 space-y-3 sm:hidden">
        {conflicts.map((conflict) => (
          <li
            key={conflict.conflict_id}
            className={cn('rounded-card border border-rule bg-surface p-3 text-sm')}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{conflict.issue ? t(`issues.${conflict.issue}`) : t('conflicts.noIssue')}</span>
              <Relationship conflict={conflict} />
            </div>
            <p className="mt-2 text-muted">
              <Explanation conflict={conflict} />
            </p>
            <dl className="mt-2 space-y-1 text-xs">
              <div>
                <dt className="inline text-muted">{t('conflicts.columns.sourceA')}: </dt>
                <dd className="inline">{sourceName(conflict.source_a, citations)}</dd>
              </div>
              <div>
                <dt className="inline text-muted">{t('conflicts.columns.sourceB')}: </dt>
                <dd className="inline">{sourceName(conflict.source_b, citations)}</dd>
              </div>
            </dl>
            {conflict.requires_human_review ? (
              <p className="mt-2 text-xs text-muted">{t('conflicts.needsReview')}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
