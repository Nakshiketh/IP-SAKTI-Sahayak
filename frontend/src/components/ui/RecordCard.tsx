import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { Heading, type HeadingLevel } from './Heading';

/**
 * A filed or granted record. Layer 2 — evidence, not authority.
 *
 * Everything here is deliberately unlike a source card: a full neutral border
 * rather than an indigo left rule, no indigo anywhere, and a label that says what
 * the thing is and cannot be dismissed. A reader must never mistake a record for
 * a statement of law, and the fastest way to guarantee that is to make the two
 * look nothing like each other.
 */
interface RecordCardProps {
  title: string;
  recordType: string;
  applicant?: string | null;
  status?: string | null;
  /** ISO date of the snapshot this record came from. */
  snapshotDate: string;
  /** Set from where the card sits in the document outline. */
  titleLevel?: HeadingLevel;
  className?: string;
}

export function RecordCard({
  title,
  recordType,
  applicant,
  status,
  snapshotDate,
  titleLevel = 3,
  className,
}: RecordCardProps) {
  const { t } = useTranslation('common');

  return (
    <article className={cn('rounded-data border border-rule-strong bg-bone p-3', className)}>
      <p className="mb-2 max-w-none text-xs text-muted">
        {t('record.notAuthority', { date: snapshotDate })}
      </p>
      <Heading level={titleLevel} className="text-base">
        {title}
      </Heading>
      <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">{t('record.recordType')}</dt>
        <dd className="m-0">{recordType}</dd>
        {applicant ? (
          <>
            <dt className="text-muted">{t('record.applicant')}</dt>
            <dd className="m-0">{applicant}</dd>
          </>
        ) : null}
        {status ? (
          <>
            <dt className="text-muted">{t('record.status')}</dt>
            <dd className="m-0">{status}</dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}
