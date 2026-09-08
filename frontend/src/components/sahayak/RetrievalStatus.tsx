import { useTranslation } from 'react-i18next';

import { Disclosure, LiveRegion } from '@/components/ui';
import { RERANK_FLOOR } from '@/services/confidence';
import type { QueryResult } from '@/services/query';
import type { Jurisdiction } from '@/types/domain';
import { cn } from '@/lib/cn';

/**
 * Two lines while it runs, one line when it is done, and everything underneath
 * on request.
 *
 * Deliberately not six lines of stage-by-stage narration. A reader waiting for
 * an answer wants to know it is working and roughly how much it found; a reader
 * assessing the engineering wants every score. Those are different people, and
 * only the first one is waiting, so the second gets a disclosure.
 *
 * There is no fake typing animation and no progress bar — the timings shown are
 * the ones the stages actually took.
 */

export type StatusPhase = 'searching' | 'reading' | 'done';

/** What retrieval reported it found, before the answer itself arrives. */
export interface RetrievalCount {
  passages: number;
  documents: number;
}

interface RetrievalStatusProps {
  phase: StatusPhase;
  /** Null while the query is still running. */
  result: QueryResult | null;
  jurisdiction: Jurisdiction;
  /** The live count, so the second line is a report rather than a guess. */
  found?: RetrievalCount | null;
  className?: string;
}

export function RetrievalStatus({
  phase,
  result,
  jurisdiction,
  found = null,
  className,
}: RetrievalStatusProps) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');

  const jurisdictionName = tc(`jurisdiction.${jurisdiction}`);

  if (phase !== 'done' || result === null) {
    return (
      <div className={cn('text-xs text-muted', className)}>
        {/* Assertive, and only on a state change — this is the one thing a
            reader is actively waiting on. */}
        <LiveRegion urgency="assertive">
          <p className="max-w-none">
            {jurisdiction === 'IN' ? t('status.searchingIn') : t('status.searchingIntl')}
          </p>
          {found ? (
            <p className="mt-1 max-w-none">
              {t('status.reading', { passages: found.passages, documents: found.documents })}
            </p>
          ) : null}
        </LiveRegion>
      </div>
    );
  }

  const candidates = result.evidence.passages.filter((p) => p.rerank_score >= RERANK_FLOOR);
  const documents = new Set(candidates.map((p) => p.document_id)).size;
  const seconds = (result.totalMs / 1000).toFixed(1);

  return (
    <div className={cn('text-xs text-muted', className)}>
      {result.route.inferred && result.route.marker ? (
        <p className="mb-2 max-w-none border-l-2 border-stamp pl-2 text-xs">
          {t('status.routedElsewhere', {
            marker: result.route.marker,
            jurisdiction: jurisdictionName,
          })}
        </p>
      ) : null}

      <Disclosure
        summary={
          <span>
            {candidates.length === 0
              ? t('status.summaryNone', { jurisdiction: jurisdictionName, seconds })
              : t('status.summary', {
                  passages: candidates.length,
                  documents,
                  jurisdiction: jurisdictionName,
                  seconds,
                })}
          </span>
        }
      >
        <div className="space-y-4 pb-2 pt-2">
          <div>
            <p className="max-w-none text-xs text-muted">{t('status.detailHeading')}</p>
            <ul className="m-0 mt-1.5 list-none p-0">
              {result.stages.map((stage) => (
                <li
                  key={stage.id}
                  className="flex justify-between gap-4 border-b border-rule-faint py-1 last:border-b-0"
                >
                  <span>{t(`status.stages.${stage.id}`)}</span>
                  <span className="tabular-nums text-muted">
                    {t('status.milliseconds', { ms: stage.ms })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="max-w-none text-xs text-muted">{t('status.passagesHeading')}</p>
            <ul className="m-0 mt-1.5 list-none p-0">
              {result.evidence.passages.map((passage) => {
                const belowFloor = passage.rerank_score < RERANK_FLOOR;
                return (
                  <li
                    key={passage.citation_id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule-faint py-1 last:border-b-0"
                  >
                    <span className="font-mono text-[0.7rem]">{passage.document_id}</span>
                    <span className="tabular-nums">
                      {t('status.scoreRetrieval')} {passage.retrieval_score.toFixed(2)} ·{' '}
                      {t('status.scoreRerank')} {passage.rerank_score.toFixed(2)}
                      {belowFloor ? (
                        <span className="ml-2 text-lac">{t('status.belowFloor')}</span>
                      ) : null}
                      {!passage.within_effective_window ? (
                        <span className="ml-2 text-lac">{t('status.outOfWindow')}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Disclosure>
    </div>
  );
}
