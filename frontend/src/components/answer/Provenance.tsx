import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';
import type { Citation, ProvisionApplicability } from '@/types/domain';

/**
 * Why am I seeing this?
 *
 * The chain from a sentence back to the thing that justifies it: the passage it
 * was built from, the document that passage is in, how far that document has
 * been checked, and when. A reader who doubts a line should be able to follow
 * it all the way down without leaving the page.
 *
 * Only evidence appears here. There is no explanation of how the system chose,
 * because any such account would be written after the fact and would read as
 * reasoning the machine did not do. The ranking signal is shown and labelled as
 * a ranking signal: it says this passage matched the words of the question well,
 * which is not the same as the answer being right, and conflating the two is
 * exactly the mistake a number invites.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid gap-0.5 border-b border-rule py-2 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function Provenance({
  citation,
  passage,
  applicability,
}: {
  citation: Citation;
  passage?: string;
  applicability?: ProvisionApplicability;
}) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');

  return (
    <div>
      {passage ? (
        <blockquote className="rounded-card border border-rule bg-surface-sunk p-3 text-sm">
          {passage}
        </blockquote>
      ) : null}

      <dl className="mt-3">
        <Row label={t('provenance.document')}>{citation.document_title}</Row>
        <Row label={t('provenance.authority')}>{citation.organization}</Row>
        <Row label={t('provenance.section')}>{citation.section_label}</Row>
        <Row label={t('provenance.jurisdiction')}>
          {tc(`jurisdiction.${citation.jurisdiction}`)}
        </Row>
        <Row label={t('provenance.verification')}>
          <span className="flex flex-wrap items-center gap-2">
            {citation.verification_status === 'verified' ? (
              <Badge tone="sourced">{tc('answer.verifiedBadge')}</Badge>
            ) : null}
            {citation.provenance_pending ? (
              <Badge tone="caution">{tc('answer.provenancePending')}</Badge>
            ) : null}
            {citation.review_state ? (
              <span className="text-muted">
                {t(`provenance.reviewState.${citation.review_state}`, citation.review_state)}
              </span>
            ) : null}
          </span>
        </Row>
        <Row label={t('provenance.reviewedAt')}>{citation.reviewed_at}</Row>
        <Row label={t('provenance.asOf')}>{citation.as_of_date}</Row>
        {applicability ? (
          <Row label={t('provenance.applies')}>
            <span>
              {t(`provenance.applicability.${applicability.status}`)}
              {applicability.needs_facts.length > 0
                ? ` — ${t('provenance.needsFacts', {
                    facts: applicability.needs_facts.join(', '),
                  })}`
                : ''}
            </span>
          </Row>
        ) : null}
        <Row label={t('provenance.ranking')}>
          {citation.rerank_score === null ? null : (
            <span>
              {citation.rerank_score.toFixed(2)}{' '}
              <span className="text-muted">{t('provenance.rankingNote')}</span>
            </span>
          )}
        </Row>
      </dl>

      {citation.url ? (
        <p className="mt-3 text-sm">
          <a className="underline" href={citation.url} target="_blank" rel="noreferrer noopener">
            {t('provenance.openOfficial')}
          </a>
        </p>
      ) : null}
    </div>
  );
}
