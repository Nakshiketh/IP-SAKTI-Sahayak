import { useTranslation } from 'react-i18next';

import { Disclosure } from '@/components/ui';
import type { Answer, Confidence } from '@/types/domain';

/**
 * What produced this answer, on the record.
 *
 * Collapsed, because almost nobody wants it and the few who do want all of it:
 * the case id, when it ran, which corpus, which sources, how sure it was per
 * issue, what was thrown away, and what safety rule fired. It is the artefact
 * you would want if you had to defend the answer six months later.
 *
 * "Claims removed" is here rather than buried in an audit row. An answer that
 * quietly dropped a third of what it was going to say has told the reader
 * something, and the number is the only place that shows.
 */

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[12rem_1fr] sm:gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="break-words text-sm">{value}</dd>
    </div>
  );
}

export function AnswerReceipt({
  answer,
  droppedClaims,
  className,
}: {
  answer: Answer;
  droppedClaims?: number;
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  const analysis = answer.analysis;

  const byIssue = (analysis?.issues ?? []).filter(
    (issue) => issue.status === 'indicated' && issue.confidence !== null,
  );
  const reviewDates = answer.citations
    .map((citation) => citation.reviewed_at)
    .filter((date): date is string => Boolean(date));

  return (
    <Disclosure summary={t('receipt.heading')} {...(className ? { className } : {})}>
      <dl className="divide-y divide-rule">
        <Line label={t('receipt.caseId')} value={answer.answer_id} />
        <Line label={t('receipt.queryId')} value={answer.query_id} />
        <Line label={t('receipt.asOf')} value={answer.as_of_date} />
        <Line label={t('receipt.corpusVersion')} value={answer.corpus_version} />
        <Line label={t('receipt.jurisdiction')} value={tc(`jurisdiction.${answer.jurisdiction}`)} />
        <Line label={t('receipt.language')} value={answer.language} />
        <Line
          label={t('receipt.sources')}
          value={
            answer.citations.length === 0
              ? null
              : [...new Set(answer.citations.map((c) => c.document_id))].join(', ')
          }
        />
        <Line
          label={t('receipt.verification')}
          value={t('receipt.verificationValue', {
            verified: answer.citations.filter((c) => c.verification_status === 'verified').length,
            total: answer.citations.length,
          })}
        />
        <Line
          label={t('receipt.reviewDates')}
          value={
            reviewDates.length > 0
              ? [...new Set(reviewDates)].sort().join(', ')
              : t('receipt.noReviewYet')
          }
        />
        <Line
          label={t('receipt.confidenceByIssue')}
          value={
            byIssue.length === 0 ? (
              t('receipt.overallOnly', { level: tc(`confidence.${answer.confidence}`) })
            ) : (
              <ul className="space-y-0.5">
                {byIssue.map((issue) => (
                  <li key={issue.issue}>
                    {t(`issues.${issue.issue}`)} —{' '}
                    {tc(`confidence.${issue.confidence as Confidence}`)}
                  </li>
                ))}
              </ul>
            )
          }
        />
        <Line
          label={t('receipt.claimsRemoved')}
          value={droppedClaims === undefined ? null : String(droppedClaims)}
        />
        <Line
          label={t('receipt.safetyFlags')}
          value={
            analysis?.abstain_code
              ? t(`abstainCode.${analysis.abstain_code}`, analysis.abstain_code)
              : t('receipt.noFlags')
          }
        />
      </dl>
    </Disclosure>
  );
}
