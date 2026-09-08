import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SourceCard } from '@/components/answer/SourceCard';
import { SearchElsewhere } from '@/components/sahayak/SearchElsewhere';
import { RecordCard, TabPanel, Tabs } from '@/components/ui';
import type { QueryResult } from '@/services/query';

/**
 * Three tabs: what the answer rests on, what somebody filed, and where this
 * product did not look.
 *
 * They are tabs rather than one scrolling list because the boundaries are the
 * point. A source is authority. A record is evidence that an application exists.
 * A portal is a place the product deliberately did not search. Putting any two
 * of those in one column, however carefully labelled, makes the second look like
 * the first.
 *
 * When the system has abstained the records tab says so again, in as many words.
 * Records existing is not an answer, and this is the surface where that
 * confusion would be most expensive.
 */
export function AnswerPanel({ result }: { result: QueryResult }) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  const [tab, setTab] = useState('sources');
  const idBase = useId();

  const abstained = result.answer === null;
  // The answer's own citations, not the fixture's. An abstention has none, and
  // that is the point: there is nothing the answer rested on.
  const citations = result.answer?.citations ?? [];
  const records = result.relatedRecords;

  return (
    <div>
      <Tabs
        aria-label={tc('answer.sourcesHeading')}
        idBase={idBase}
        value={tab}
        onChange={setTab}
        items={[
          { id: 'sources', label: t('records.sourcesTab'), count: citations.length },
          { id: 'records', label: t('records.tab'), count: records.length },
          { id: 'elsewhere', label: t('elsewhere.tab') },
        ]}
      />

      <TabPanel id="sources" idBase={idBase} active={tab === 'sources'}>
        <ul className="m-0 mt-3 list-none space-y-3 p-0">
          {citations.map((citation, index) => (
            <li key={citation.citation_id}>
              <SourceCard
                id={`source-${citation.citation_id}`}
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
      </TabPanel>

      <TabPanel id="records" idBase={idBase} active={tab === 'records'}>
        <p className="mt-3 max-w-none text-xs text-muted">{t('records.note')}</p>
        {abstained && records.length > 0 ? (
          <p className="mt-2 max-w-none border-l-2 border-lac pl-2 text-xs text-lac">
            {t('records.stillAbstained')}
          </p>
        ) : null}
        {records.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t('records.empty')}</p>
        ) : (
          <ul className="m-0 mt-3 list-none space-y-3 p-0">
            {records.map((record) => (
              <li key={record.record_id}>
                <RecordCard
                  title={record.title}
                  recordType={tc(`recordType.${record.record_type}`)}
                  applicant={record.applicant}
                  status={record.status}
                  snapshotDate={record.snapshot_at ?? t('records.noSnapshot')}
                  titleLevel={3}
                />
              </li>
            ))}
          </ul>
        )}
      </TabPanel>

      <TabPanel id="elsewhere" idBase={idBase} active={tab === 'elsewhere'}>
        <SearchElsewhere question={result.question} />
      </TabPanel>
    </div>
  );
}
