import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button, Callout, ConfidenceMeter, buttonStyles } from '@/components/ui';
import { SourceCard } from '@/components/answer/SourceCard';
import type { QueryResult } from '@/services/query';
import type { AbstainReason, Citation } from '@/types/domain';

/**
 * The system declining to answer. A state, not an error.
 *
 * Five reasons, each with what the reader is offered next, in lac and never
 * dressed up to read like a thin answer. Two of them show the passages that
 * caused them — a conflict is only useful if you can see both sides of it, and
 * a stale source is only useful with its dates.
 *
 * What this deliberately does not do is soften. There is no "here is what I
 * found anyway" above the fold, because that is how an abstention becomes an
 * answer a reader acts on.
 */
interface AbstentionProps {
  result: QueryResult;
  onRephrase: () => void;
  onPickJurisdiction: () => void;
  onNameProduct: () => void;
  onEscalate: () => void;
}

/** Reasons where showing the passages is the point of the abstention. */
const SHOWS_PASSAGES: AbstainReason[] = ['sources_conflict', 'sources_out_of_date'];

export function Abstention({
  result,
  onRephrase,
  onPickJurisdiction,
  onNameProduct,
  onEscalate,
}: AbstentionProps) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');

  const reason = result.confidence.abstainReason ?? 'nothing_relevant';

  /**
   * The passages that caused this abstention, taken from what was actually
   * retrieved. There is no answer to read citations off — that is what
   * abstaining means — so the card is built from the retrieval evidence and the
   * source metadata the result carries with it.
   */
  const involved: Citation[] = SHOWS_PASSAGES.includes(reason)
    ? result.evidence.passages
        .filter((passage) =>
          reason === 'sources_out_of_date'
            ? !passage.within_effective_window
            : result.evidence.contradictions.flat().includes(passage.citation_id),
        )
        .map((passage) => result.sources[passage.citation_id])
        .filter((citation): citation is Citation => citation !== undefined)
    : [];

  return (
    <section className="mt-6" data-abstained="true" data-abstain-reason={reason}>
      <ConfidenceMeter
        level="abstain"
        reason={tc(
          `confidence.reasons.${result.confidence.reasonKey}`,
          result.confidence.reasonVars,
        )}
        className="mb-4"
      />

      <Callout tone="abstain" title={t(`abstention.${reason}.title`)} titleLevel={2}>
        {t(`abstention.${reason}.body`)}
      </Callout>

      {involved.length > 0 ? (
        <ul className="m-0 mt-4 list-none space-y-3 p-0">
          {involved.map((citation, index) => (
            <li key={citation.citation_id}>
              <SourceCard
                citation={citation}
                number={index + 1}
                titleLevel={3}
                {...(result.passages[citation.citation_id]
                  ? { passage: result.passages[citation.citation_id] as string }
                  : {})}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        <p className="text-xs text-muted">{t('abstention.offersHeading')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onRephrase}>
            {t('abstention.offers.rephrase')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onPickJurisdiction}>
            {t('abstention.offers.jurisdiction')}
          </Button>
          <Button variant="secondary" size="sm" onClick={onNameProduct}>
            {t('abstention.offers.product')}
          </Button>
          <Link
            to="/what-is-covered"
            className={buttonStyles({ variant: 'secondary', size: 'sm' })}
          >
            {t('abstention.offers.covered')}
          </Link>
          <Button variant="danger" size="sm" onClick={onEscalate}>
            {t('abstention.offers.escalate')}
          </Button>
        </div>
      </div>
    </section>
  );
}
