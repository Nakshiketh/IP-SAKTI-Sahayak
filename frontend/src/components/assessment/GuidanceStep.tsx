import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { SectionSourceList, SourceScope, Src } from '@/components/sourcing/Sourced';
import { Badge, Callout, TabPanel, Tabs } from '@/components/ui';
import { IP_TYPES, type Assessment, type IpType } from '@/services/assessment';
import type { DocumentId } from '@/services/corpusManifest';

/**
 * Recommended protection, and the steps for each route through the Indian
 * system. One tab per kind of protection; the recommended ones say so, and the
 * first of them is open. Each route names the instrument that governs it as a
 * pointer to where to read — nothing here quotes a provision.
 */

const ROUTE_STEPS = {
  patent: ['requirements', 'search', 'documents', 'file', 'examination'],
  trademark: ['availability', 'class', 'prepare', 'file', 'stages'],
  copyright: ['identify', 'prepare', 'apply'],
  tradeSecret: ['identify', 'restrict', 'agreements', 'document'],
} as const;

const ROUTE_SOURCES: Record<IpType, DocumentId[]> = {
  patent: ['in-patents-act-1970', 'in-patents-rules-2003'],
  trademark: ['in-trade-marks-act-1999', 'in-trade-marks-rules-2017'],
  copyright: ['in-copyright-act-1957'],
  tradeSecret: [],
};

export function GuidanceView({
  assessment,
  headingRef,
}: {
  assessment: Assessment;
  headingRef: React.RefObject<HTMLHeadingElement>;
}) {
  const { t } = useTranslation('assessment');
  const idBase = useId();
  const [tab, setTab] = useState<IpType>(assessment.recommended[0] ?? 'patent');

  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1} className="text-lg outline-none">
        {t('guidance.heading')}
      </h2>
      <p className="mt-2 text-muted">{t('guidance.standfirst')}</p>

      <Tabs
        aria-label={t('guidance.tabsLabel')}
        idBase={idBase}
        className="mt-6 flex-wrap gap-x-6"
        items={IP_TYPES.map((type) => ({ id: type, label: t(`result.ip.${type}.title`) }))}
        value={tab}
        onChange={(id) => setTab(id as IpType)}
      />

      {IP_TYPES.map((type) => (
        <TabPanel key={type} id={type} idBase={idBase} active={tab === type}>
          <div className="step-in pt-6" data-direction="forward">
            <Badge tone={assessment.recommended.includes(type) ? 'sourced' : 'neutral'}>
              {assessment.recommended.includes(type) ? t('guidance.recommended') : t('guidance.notRecommended')}
            </Badge>
            <p className="mt-3 text-base">
              <span className="text-muted">{t('guidance.office')}: </span>
              {t(`guidance.${type}.office`)}
            </p>
            <Route type={type} />
          </div>
        </TabPanel>
      ))}

      <Callout tone="caution" title={t('guidance.disclaimerTitle')} className="mt-10">
        {t('guidance.disclaimer')}
      </Callout>
    </div>
  );
}

function Route({ type }: { type: IpType }) {
  const { t } = useTranslation('assessment');
  const steps = ROUTE_STEPS[type];
  const sources = ROUTE_SOURCES[type];

  const list = (
    <ol className="m-0 mt-6 list-none p-0">
      {steps.map((step, index) => (
        <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-9 w-px bg-rule" />
          ) : null}
          <span
            aria-hidden="true"
            className="relative grid h-8 w-8 shrink-0 place-items-center rounded-seal border border-leaf bg-bone text-xs font-medium tabular-nums text-leaf"
          >
            {index + 1}
          </span>
          <div className="min-w-0 pt-1">
            <h3 className="text-base font-medium">
              {t(`guidance.${type}.steps.${step as 'requirements'}.title` as 'guidance.patent.steps.requirements.title')}
            </h3>
            <p className="mt-1 max-w-measure text-muted">
              {t(`guidance.${type}.steps.${step as 'requirements'}.body` as 'guidance.patent.steps.requirements.body')}
              {index === 0 && sources.length > 0
                ? sources.map((doc) => <Src key={doc} doc={doc} />)
                : null}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      {sources.length > 0 ? (
        <SourceScope documentIds={sources}>
          {list}
          <SectionSourceList />
          <p className="mt-2 text-xs text-muted">{t('guidance.sourcesNote')}</p>
        </SourceScope>
      ) : (
        <>
          {list}
          <p className="mt-5 border-l-2 border-rule-strong pl-3 text-xs text-muted">
            {t('guidance.tradeSecret.noStatute')}
          </p>
        </>
      )}
      {type === 'patent' ? (
        <Link
          to={{ pathname: '/', hash: '#patent-route' }}
          className="mt-5 inline-block text-base text-leaf underline underline-offset-4"
        >
          {t('guidance.patent.more')}
        </Link>
      ) : null}
    </>
  );
}
