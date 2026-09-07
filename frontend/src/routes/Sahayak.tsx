import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { AnswerView } from '@/components/answer';
import { SourceCard } from '@/components/answer/SourceCard';
import { Composer } from '@/components/sahayak/Composer';
import { ContextLine } from '@/components/sahayak/ContextLine';
import { StarterQuestions } from '@/components/sahayak/StarterQuestions';
import {
  Badge,
  BottomSheet,
  Button,
  Callout,
  Drawer,
  JurisdictionToggle,
  LiveRegion,
  Select,
} from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { DESKTOP_QUERY, TABLET_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { findLocale, type LocaleCode } from '@/i18n/languages';
import { cn } from '@/lib/cn';
import { DEMO_ANSWERS } from '@/services/answers.mock';
import { PRODUCT_CLASSES, type Jurisdiction, type ProductClass } from '@/types/domain';

/**
 * The workspace.
 *
 * It opens as one centred column and stays that way until there is an answer to
 * put beside something. Three columns is a state this reaches, not a state it
 * starts in — a first-time reader should see a question box, not a cockpit.
 *
 * Zero decisions before the first answer: jurisdiction defaults to India and
 * says so, the answer language is read off the script as you type, and the
 * product type stays unknown until it matters.
 *
 * Retrieval arrives in Phase 10. Until then every question returns the same
 * illustrative answer and the page says so plainly.
 */

const MARKETS = ['uk', 'eu', 'us'] as const;
type Market = (typeof MARKETS)[number];

export default function Sahayak() {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  const { i18n } = useTranslation();
  useDocumentMeta(t('meta.title'), t('meta.description'));

  const [params, setParams] = useSearchParams();
  const [question, setQuestion] = useState(() => params.get('q')?.trim() ?? '');

  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('IN');
  const [market, setMarket] = useState<Market>('uk');
  const [productClass, setProductClass] = useState<ProductClass>('undetermined');
  const [language, setLanguage] = useState<LocaleCode>(
    () => findLocale(i18n.resolvedLanguage ?? i18n.language).code,
  );
  const [languageOverridden, setLanguageOverridden] = useState(false);

  const [startersOpen, setStartersOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);

  const hasAnswer = question.length > 0;
  const threeColumn = hasAnswer && isDesktop;
  const answer = DEMO_ANSWERS[jurisdiction];

  const ask = useCallback(
    (text: string) => {
      setQuestion(text);
      setParams({ q: text }, { replace: true });
      setStartersOpen(false);
    },
    [setParams],
  );

  // Cmd/Ctrl+K focuses the composer from anywhere on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        composerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[80rem] px-5 py-8">
      {/*
        Before an answer the whole page is one centred column — heading, toggle
        and composer share an edge. Once the three-column layout opens, the
        heading and the toggle span it. Letting the header sit full-width while
        the composer was centred left them visibly unaligned.
      */}
      <div className={cn(threeColumn ? null : 'mx-auto max-w-measure')}>
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-xl">{t('heading')}</h1>
          <span className="rounded-seal border border-lac px-2.5 py-0.5 text-xs text-lac">
            {t('notLegalAdvice')}
          </span>
        </header>
        <p className="mt-2 max-w-measure text-muted">{t('standfirst')}</p>

        {/* The most prominent control on the page. It swaps the answer set. */}
        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-xs text-muted" id="jurisdiction-label">
              {t('jurisdictionLabel')}
            </p>
            <JurisdictionToggle
              aria-label={t('jurisdictionLabel')}
              value={jurisdiction}
              onChange={setJurisdiction}
              labels={{ IN: tc('jurisdiction.IN'), INTL: tc('jurisdiction.INTL') }}
            />
          </div>
          {jurisdiction === 'INTL' ? (
            <Select
              label={t('marketLabel')}
              value={market}
              onChange={(event) => setMarket(event.target.value as Market)}
              options={MARKETS.map((value) => ({ value, label: t(`markets.${value}`) }))}
            />
          ) : null}
        </div>
      </div>

      {/*
        The layout the whole phase turns on. One column until an answer exists;
        three only at desktop width once it does.
      */}
      <div
        data-layout={threeColumn ? 'three-column' : 'single-column'}
        className={cn(
          'mt-8',
          threeColumn
            ? 'grid grid-cols-[auto_minmax(0,1fr)_22.5rem] gap-8'
            : 'mx-auto max-w-measure',
        )}
      >
        {threeColumn ? (
          <ContextRail
            open={railOpen}
            onToggle={() => setRailOpen((open) => !open)}
            jurisdiction={jurisdiction}
            language={language}
            productClass={productClass}
          />
        ) : null}

        <div className="min-w-0">
          <ContextLine
            className="mb-3"
            jurisdiction={jurisdiction}
            language={language}
            productClass={productClass}
            onEditJurisdiction={() =>
              document.querySelector<HTMLElement>('[role="radiogroup"] [tabindex="0"]')?.focus()
            }
            onEditLanguage={() => setContextOpen(true)}
            onEditProduct={() => setContextOpen(true)}
          />

          <Composer
            ref={composerRef}
            onSubmit={ask}
            language={language}
            languageOverridden={languageOverridden}
            onLanguageChange={(next) => {
              setLanguage(next);
              setLanguageOverridden(true);
            }}
            onDetected={setLanguage}
            onSlash={() => setStartersOpen(true)}
          />

          {contextOpen ? (
            <div className="mt-3 flex flex-wrap items-end gap-4 rounded-control border border-rule bg-surface-sunk p-3">
              <Select
                label={t('context.changeProduct')}
                value={productClass}
                onChange={(event) => setProductClass(event.target.value as ProductClass)}
                options={PRODUCT_CLASSES.map((value) => ({
                  value,
                  label: tc(`productClass.${value}`),
                }))}
              />
              <Button variant="quiet" size="sm" onClick={() => setContextOpen(false)}>
                {t('context.close')}
              </Button>
            </div>
          ) : null}

          {!hasAnswer ? (
            <StarterQuestions onPick={ask} open={startersOpen} onOpenChange={setStartersOpen} />
          ) : null}

          {hasAnswer ? (
            <section className="mt-8">
              <p className="text-xs text-muted">{t('answer.questionLabel')}</p>
              <p className="mt-1 max-w-measure text-md">{question}</p>

              {/* Sits directly under the page h1, so h2 — h3 would skip a level. */}
              <Callout
                tone="caution"
                title={tc('answer.demoChip')}
                titleLevel={2}
                className="mt-5 max-w-measure"
              >
                {t('demoNotice')}
              </Callout>

              <LiveRegion urgency="polite" visuallyHidden>
                {t('answer.announced', { count: answer.citations.length })}
              </LiveRegion>

              {/* Below desktop the sources live behind a control with a count. */}
              {!isDesktop ? (
                <Button variant="secondary" className="mt-6" onClick={() => setSourcesOpen(true)}>
                  {t('answer.sourcesButton')}
                  <Badge tone="sourced">{answer.citations.length}</Badge>
                </Button>
              ) : null}

              <AnswerView
                className="mt-6 lg:grid-cols-1"
                headingLevel={2}
                answer={answer}
                confidenceReason={tc('confidence.demoReason', {
                  count: answer.citations.length,
                })}
                hideSources
              />
            </section>
          ) : null}
        </div>

        {threeColumn ? (
          <div className="min-w-0">
            <h2 className="text-base text-muted">
              {t('answer.sourcesTitle')}{' '}
              <span className="text-xs">
                {tc('answer.sourceCount', { count: answer.citations.length })}
              </span>
            </h2>
            <ul className="m-0 mt-3 list-none space-y-3 p-0">
              {answer.citations.map((citation, index) => (
                <li key={citation.citation_id}>
                  <SourceCard citation={citation} number={index + 1} titleLevel={3} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Tablet gets a drawer, a phone gets a bottom sheet. */}
      {!isDesktop && isTablet ? (
        <Drawer
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
          title={t('answer.sourcesTitle')}
        >
          <SourceList answerId={answer.answer_id} citations={answer.citations} />
        </Drawer>
      ) : null}

      {!isTablet ? (
        <BottomSheet
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
          title={t('answer.sourcesTitle')}
        >
          <SourceList answerId={answer.answer_id} citations={answer.citations} />
        </BottomSheet>
      ) : null}
    </div>
  );
}

function SourceList({
  answerId,
  citations,
}: {
  answerId: string;
  citations: (typeof DEMO_ANSWERS)['IN']['citations'];
}) {
  return (
    <ul className="m-0 list-none space-y-3 p-0">
      {citations.map((citation, index) => (
        <li key={citation.citation_id}>
          <SourceCard
            id={`${answerId}-sheet-${citation.citation_id}`}
            citation={citation}
            number={index + 1}
            titleLevel={3}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Available, collapsed by default. It exists for the reader who wants to see
 * everything the answer is assuming at once; the context line above the composer
 * is enough for everyone else.
 */
function ContextRail({
  open,
  onToggle,
  jurisdiction,
  language,
  productClass,
}: {
  open: boolean;
  onToggle: () => void;
  jurisdiction: Jurisdiction;
  language: LocaleCode;
  productClass: ProductClass;
}) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');

  return (
    <div className={cn('border-r border-rule pr-6', open ? 'w-[17.5rem]' : 'w-auto')}>
      <Button variant="quiet" size="sm" onClick={onToggle} aria-expanded={open}>
        {open ? t('rail.collapse') : t('rail.expand')}
      </Button>
      {open ? (
        <dl className="m-0 mt-4 text-xs">
          <dt className="text-muted">{t('jurisdictionLabel')}</dt>
          <dd className="m-0 mb-3">{tc(`jurisdiction.${jurisdiction}`)}</dd>
          <dt className="text-muted">{t('context.changeLanguage')}</dt>
          <dd className="m-0 mb-3">{findLocale(language).nativeName}</dd>
          <dt className="text-muted">{t('context.changeProduct')}</dt>
          <dd className="m-0">{tc(`productClass.${productClass}`)}</dd>
        </dl>
      ) : null}
    </div>
  );
}
