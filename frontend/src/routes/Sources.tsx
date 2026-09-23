import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, Select, type BuildState } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { cn } from '@/lib/cn';
import {
  CORPUS_DOCUMENTS,
  facetValues,
  GROUP_ORDER,
  type GroupKey,
  type ManifestDocument,
} from '@/services/corpusManifest';
import { isIngested, RECORDS_SOURCES, type RecordsSource } from '@/services/recordsManifest';
import { chunks as knowledgeChunks } from '@corpus/guidance/knowledge-base.json';
import {
  sourceHost,
  VERIFIED_DOCUMENTS,
  VERIFIED_REVIEWED_ON,
  verifiedFor,
  type VerifiedDocument,
} from '@/services/verifiedSources';

/**
 * Driven entirely by data files. There is no hard-coded list of sources,
 * groups or facet options anywhere on this page.
 *
 * The first section lists the verified official sources answers are built
 * from (`corpus/guidance/sources.json`), each with its link and the date
 * it was checked. The second lists the wider library planned for full-text
 * indexing (`corpus/manifest.json`); a document there that a verified source
 * already covers shows that source's official link.
 */

/** How many verified passages each official document contributes to answers. */
const PASSAGES_BY_DOCUMENT = knowledgeChunks.reduce(
  (counts, chunk) => counts.set(chunk.document_id, (counts.get(chunk.document_id) ?? 0) + 1),
  new Map<string, number>(),
);

type Dating = 'any' | 'dated' | 'undated';

interface Filters {
  search: string;
  jurisdiction: string;
  group: string;
  document_type: string;
  verification_status: string;
  dating: Dating;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  jurisdiction: 'any',
  group: 'any',
  document_type: 'any',
  verification_status: 'any',
  dating: 'any',
};

const HONEST_ITEMS = [
  { key: 'primary', state: 'planned' },
  { key: 'versions', state: 'planned' },
  { key: 'dates', state: 'live' },
  { key: 'beyond', state: 'live' },
  { key: 'uncertainty', state: 'live' },
  { key: 'check', state: 'live' },
  { key: 'subscription', state: 'planned' },
  { key: 'escalate', state: 'planned' },
] as const satisfies ReadonlyArray<{ key: string; state: BuildState }>;

const NOT_COVERED = [
  'clinical',
  'drafting',
  'outcome',
  'jurisdictions',
  'realtime',
  'novelty',
  'representation',
] as const;

export default function Sources() {
  const { t } = useTranslation('sources');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <article className="mx-auto max-w-[75rem] px-5 py-12">
      <header className="border-b border-rule-strong pb-6">
        <h1 className="text-2xl">{t('heading')}</h1>
        <p className="mt-3 max-w-measure text-md text-muted">{t('standfirst')}</p>
      </header>

      <VerifiedSection />
      <CorpusSection />
      <RecordsSection />
      <HonestySection />
      <NotCoveredSection />
    </article>
  );
}

function VerifiedSection() {
  const { t } = useTranslation('sources');
  const { t: tc } = useTranslation('common');

  return (
    <section id="verified" className="mt-14 scroll-mt-8">
      <h2 className="text-xl">{t('verified.heading')}</h2>
      <p className="mt-2 max-w-measure text-muted">
        {t('verified.standfirst', {
          count: VERIFIED_DOCUMENTS.length,
          date: VERIFIED_REVIEWED_ON,
        })}
      </p>

      {(['IN', 'INTL'] as const).map((jurisdiction) => {
        const documents = VERIFIED_DOCUMENTS.filter((doc) => doc.jurisdiction === jurisdiction);
        return (
          <div key={jurisdiction} className="mt-10">
            <h3 className="border-b border-rule-strong pb-2 text-md">
              {tc(`jurisdiction.${jurisdiction}`)}{' '}
              <span className="text-xs text-muted">{documents.length}</span>
            </h3>
            <ul className="m-0 mt-4 grid list-none gap-4 p-0 lg:grid-cols-2">
              {documents.map((doc) => (
                <li key={doc.document_id}>
                  <VerifiedCard doc={doc} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function VerifiedCard({ doc }: { doc: VerifiedDocument }) {
  const { t } = useTranslation('sources');

  const rows: Array<[string, React.ReactNode]> = [
    [t('corpus.fields.organization'), doc.organization],
    [t('corpus.fields.documentType'), t(`corpus.documentTypes.${doc.document_type as 'act'}`)],
    ...(doc.version_label
      ? ([[t('corpus.fields.version'), doc.version_label]] as Array<[string, React.ReactNode]>)
      : []),
    [t('verified.checked'), VERIFIED_REVIEWED_ON],
    [
      t('verified.usedIn'),
      t('verified.passages', { count: PASSAGES_BY_DOCUMENT.get(doc.document_id) ?? 0 }),
    ],
    [
      t('corpus.fields.link'),
      <a
        key="link"
        href={doc.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-stamp underline underline-offset-4"
      >
        {sourceHost(doc.source_url)}
      </a>,
    ],
  ];

  return (
    <Card variant="data" as="article" className="h-full border-l-2 border-stamp p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-base">{doc.document_title}</h4>
        <Badge tone="sourced">{t('corpus.verification.verified')}</Badge>
      </div>
      <dl className="m-0 mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function CorpusSection() {
  const { t } = useTranslation('sources');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const matches = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return CORPUS_DOCUMENTS.filter((doc) => {
      if (filters.jurisdiction !== 'any' && doc.jurisdiction !== filters.jurisdiction) return false;
      if (filters.group !== 'any' && doc.group !== filters.group) return false;
      if (filters.document_type !== 'any' && doc.document_type !== filters.document_type) {
        return false;
      }
      if (
        filters.verification_status !== 'any' &&
        doc.verification_status !== filters.verification_status
      ) {
        return false;
      }
      if (filters.dating === 'dated' && doc.effective_from === null) return false;
      if (filters.dating === 'undated' && doc.effective_from !== null) return false;
      if (needle) {
        const haystack = `${doc.title} ${doc.short_title ?? ''} ${doc.organization}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [filters]);

  // Groups render in manifest order, and only when they have a match.
  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((group) => ({
        group,
        documents: matches.filter((doc) => doc.group === group),
      })).filter((entry) => entry.documents.length > 0),
    [matches],
  );

  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <section id="corpus" className="mt-14 scroll-mt-8">
      <h2 className="text-xl">{t('corpus.heading')}</h2>
      <p className="mt-2 max-w-measure text-muted">{t('corpus.layer')}</p>

      <div className="mt-6 rounded-data border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="text-xs text-muted">{t('corpus.searchLabel')}</span>
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((f) => ({ ...f, search: event.target.value }))}
              placeholder={t('corpus.searchPlaceholder')}
              className="rounded-control border border-rule-strong bg-bone px-3 py-1.5 text-base"
            />
          </label>

          <Facet
            field="jurisdiction"
            value={filters.jurisdiction}
            onChange={(value) => setFilters((f) => ({ ...f, jurisdiction: value }))}
          />
          <Facet
            field="group"
            value={filters.group}
            onChange={(value) => setFilters((f) => ({ ...f, group: value }))}
          />
          <Facet
            field="document_type"
            value={filters.document_type}
            onChange={(value) => setFilters((f) => ({ ...f, document_type: value }))}
          />
          <Facet
            field="verification_status"
            value={filters.verification_status}
            onChange={(value) => setFilters((f) => ({ ...f, verification_status: value }))}
          />
          <Select
            label={t('corpus.facets.dating')}
            value={filters.dating}
            onChange={(event) =>
              setFilters((f) => ({ ...f, dating: event.target.value as Dating }))
            }
            options={(['any', 'dated', 'undated'] as const).map((value) => ({
              value,
              label: t(`corpus.dating.${value}`),
            }))}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <p className="max-w-none text-xs text-muted" aria-live="polite">
            {t('corpus.showing', { shown: matches.length, total: CORPUS_DOCUMENTS.length })}
          </p>
          {dirty ? (
            <Button variant="quiet" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('corpus.clear')}
            </Button>
          ) : null}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="mt-8 text-muted">{t('corpus.noneMatch')}</p>
      ) : (
        grouped.map((entry) => (
          <div key={entry.group} className="mt-10">
            <h3 className="border-b border-rule-strong pb-2 text-md">
              {t(`corpus.groups.${entry.group as GroupKey}`)}{' '}
              <span className="text-xs text-muted">{entry.documents.length}</span>
            </h3>
            <ul className="m-0 mt-4 grid list-none gap-4 p-0 lg:grid-cols-2">
              {entry.documents.map((doc) => (
                <li key={doc.document_id}>
                  <DocumentCard doc={doc} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

/** A facet whose options come from the values actually present in the manifest. */
function Facet({
  field,
  value,
  onChange,
}: {
  field: 'jurisdiction' | 'group' | 'document_type' | 'verification_status';
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('sources');
  const { t: tc } = useTranslation('common');

  const options = useMemo(() => facetValues(field), [field]);

  function labelFor(option: string): string {
    if (field === 'jurisdiction') return tc(`jurisdiction.${option as 'IN' | 'INTL'}`);
    if (field === 'group') return t(`corpus.groups.${option as GroupKey}`);
    if (field === 'document_type') return t(`corpus.documentTypes.${option as 'act'}`);
    return t(`corpus.verification.${option as 'verified'}`);
  }

  return (
    <Select
      label={t(`corpus.facets.${field}`)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      options={[
        { value: 'any', label: t('corpus.anyOption') },
        ...options.map((option) => ({ value: option, label: labelFor(option) })),
      ]}
    />
  );
}

function DocumentCard({ doc }: { doc: ManifestDocument }) {
  const { t } = useTranslation('sources');
  const { t: tc } = useTranslation('common');

  // A planned document already covered by a verified source links to it.
  const verified = verifiedFor(doc.document_id);
  const link = doc.source_url ?? verified?.source_url ?? null;

  const rows: Array<[string, React.ReactNode]> = [
    [t('corpus.fields.organization'), doc.organization],
    [t('corpus.fields.jurisdiction'), tc(`jurisdiction.${doc.jurisdiction}`)],
    [t('corpus.fields.documentType'), t(`corpus.documentTypes.${doc.document_type}`)],
    [
      t('corpus.fields.effectiveFrom'),
      doc.effective_from ?? <Empty>{t('corpus.empty.date')}</Empty>,
    ],
    [
      t('corpus.fields.retrieved'),
      doc.retrieved_at ?? <Empty>{t('corpus.empty.retrieved')}</Empty>,
    ],
    [t('corpus.fields.passages'), <Empty key="p">{t('corpus.empty.passages')}</Empty>],
    [
      t('corpus.fields.link'),
      link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-stamp underline underline-offset-4"
        >
          {sourceHost(link)}
        </a>
      ) : (
        <Empty>{t('corpus.empty.link')}</Empty>
      ),
    ],
  ];

  return (
    <Card variant="data" as="article" className="h-full p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-base">{doc.title}</h4>
        {verified ? (
          <Badge tone="sourced">{t('corpus.verification.verified')}</Badge>
        ) : (
          <Badge tone="caution">{t(`corpus.verification.${doc.verification_status}`)}</Badge>
        )}
      </div>
      <dl className="m-0 mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="m-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-lac">{children}</span>;
}

function RecordsSection() {
  const { t } = useTranslation('sources');

  return (
    <section id="records" className="mt-16 scroll-mt-8 border-t border-rule-strong pt-8">
      <h2 className="text-xl">{t('records.heading')}</h2>
      <p className="mt-2 max-w-measure text-muted">{t('records.layer')}</p>

      {/*
        Neutral, bordered, and deliberately unlike a source card. A reader must
        never be able to mistake one of these for something an answer cites.
      */}
      <p className="mt-4 max-w-measure rounded-data border border-rule-strong bg-bone p-3 text-base">
        {t('records.standingNote')}
      </p>

      <ul className="m-0 mt-8 grid list-none gap-4 p-0 lg:grid-cols-2">
        {RECORDS_SOURCES.map((source) => (
          <li key={source.source_id}>
            <RecordsSourceCard source={source} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecordsSourceCard({ source }: { source: RecordsSource }) {
  const { t } = useTranslation('sources');
  const { t: tc } = useTranslation('common');
  const portalOnly = source.access_mode === 'portal_link_only';

  return (
    <article
      className={cn(
        'h-full rounded-data border border-rule-strong bg-bone p-4',
        // No indigo anywhere on this card. Indigo means sourced.
      )}
    >
      <h3 className="text-base">{source.name}</h3>
      <dl className="m-0 mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">{t('records.fields.publisher')}</dt>
        <dd className="m-0">{source.publisher}</dd>
        <dt className="text-muted">{t('records.fields.jurisdiction')}</dt>
        <dd className="m-0">{tc(`jurisdiction.${source.jurisdiction}`)}</dd>
        <dt className="text-muted">{t('records.fields.recordType')}</dt>
        <dd className="m-0">{t(`records.recordTypes.${source.record_type}`)}</dd>
        <dt className="text-muted">{t('records.fields.access')}</dt>
        <dd className="m-0">{t(`records.access.${source.access_mode}`)}</dd>
        <dt className="text-muted">{t('records.fields.licence')}</dt>
        <dd className="m-0">
          {source.licence ? (
            <>
              {source.licence}
              {source.attribution_text ? (
                <span className="mt-1 block italic">{source.attribution_text}</span>
              ) : null}
            </>
          ) : (
            <Empty>{t('records.empty.licence')}</Empty>
          )}
        </dd>
        <dt className="text-muted">{t('records.fields.snapshot')}</dt>
        <dd className="m-0">
          {source.last_snapshot_at ?? <Empty>{t('records.empty.snapshot')}</Empty>}
        </dd>
        <dt className="text-muted">{t('records.fields.count')}</dt>
        <dd className="m-0">
          {isIngested(source) && source.record_count !== null ? (
            source.record_count
          ) : (
            <Empty>{t('records.empty.count')}</Empty>
          )}
        </dd>
      </dl>

      <p className="mt-3 max-w-none text-xs text-muted">{source.terms_note}</p>
      {portalOnly ? (
        <p className="mt-2 max-w-none border-l-2 border-lac pl-2 text-xs text-muted">
          {t('records.portalNote')}
        </p>
      ) : null}
    </article>
  );
}

function HonestySection() {
  const { t } = useTranslation('sources');

  return (
    <section id="honest" className="mt-16 scroll-mt-8 border-t border-rule-strong pt-8">
      <h2 className="text-xl">{t('honest.heading')}</h2>
      <p className="mt-3 max-w-measure text-muted">{t('honest.standfirst')}</p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-base">
          <thead>
            <tr className="border-b border-rule-strong text-left align-bottom">
              <th scope="col" className="w-[28%] py-2 pr-4 text-xs font-medium text-muted">
                {t('honest.colCommitment')}
              </th>
              <th scope="col" className="py-2 text-xs font-medium text-muted">
                {t('honest.colMechanism')}
              </th>
            </tr>
          </thead>
          <tbody>
            {HONEST_ITEMS.map((item) => (
              <tr key={item.key} className="border-b border-rule-faint align-top">
                <th scope="row" className="py-3 pr-4 text-left font-medium">
                  {t(`honest.items.${item.key}.commitment`)}
                </th>
                <td className="py-3">{t(`honest.items.${item.key}.mechanism`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotCoveredSection() {
  const { t } = useTranslation('sources');

  return (
    <section id="not-covered" className="mt-16 scroll-mt-8 border-t border-rule-strong pt-8">
      <h2 className="text-xl">{t('notCovered.heading')}</h2>
      <p className="mt-3 max-w-measure text-muted">{t('notCovered.standfirst')}</p>
      <ul className="m-0 mt-6 max-w-measure list-none p-0">
        {NOT_COVERED.map((item) => (
          <li key={item} className="border-b border-rule-faint py-3 last:border-b-0">
            {t(`notCovered.items.${item}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
