import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { AnswerView } from '@/components/answer';
import { Abstention } from '@/components/sahayak/Abstention';
import { AnswerPanel } from '@/components/sahayak/AnswerPanel';
import { Composer } from '@/components/sahayak/Composer';
import { ContextLine } from '@/components/sahayak/ContextLine';
import { EscalationForm } from '@/components/sahayak/EscalationForm';
import { RetrievalStatus, type StatusPhase } from '@/components/sahayak/RetrievalStatus';
import { StarterQuestions } from '@/components/sahayak/StarterQuestions';
import {
  Badge,
  BottomSheet,
  Button,
  Callout,
  Chip,
  Drawer,
  JurisdictionToggle,
  LiveRegion,
  Select,
} from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { DESKTOP_QUERY, TABLET_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { findLocale, type LocaleCode } from '@/i18n/languages';
import { answerToText } from '@/lib/answerText';
import { cn } from '@/lib/cn';
import { MOCK_LATENCY_MS, runQuery } from '@/services/query.mock';
import { PRODUCT_CLASSES, type Jurisdiction, type ProductClass } from '@/types/domain';

/**
 * The workspace.
 *
 * One centred column until an answer exists; three at desktop width once it
 * does. Zero decisions before the first answer.
 *
 * The answer surface is real: confidence comes from `scoreConfidence` run over
 * the retrieval evidence, and an abstention is a first-class outcome rather than
 * an error toast. What is still mocked is the retrieval — Phase 10 replaces the
 * service behind `runQuery` without the components above it changing.
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
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [phase, setPhase] = useState<StatusPhase>('done');
  const [copied, setCopied] = useState<'answer' | 'link' | null>(null);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);

  const hasAnswer = question.length > 0;
  const threeColumn = hasAnswer && isDesktop;

  const result = useMemo(
    () => (hasAnswer ? runQuery(question, jurisdiction) : null),
    [hasAnswer, question, jurisdiction],
  );
  const abstained = result !== null && result.answer === null;

  const ask = useCallback(
    (text: string) => {
      setQuestion(text);
      setParams({ q: text }, { replace: true });
      setStartersOpen(false);
      setPhase('searching');
    },
    [setParams],
  );

  // Two status lines, then the summary. The delays live in the mock service
  // rather than here, because they stand in for work the pipeline will actually
  // do — Phase 10 replaces them with a real stream.
  useEffect(() => {
    if (phase === 'done') return;
    const toReading = window.setTimeout(() => setPhase('reading'), MOCK_LATENCY_MS.searching);
    const toDone = window.setTimeout(
      () => setPhase('done'),
      MOCK_LATENCY_MS.searching + MOCK_LATENCY_MS.reading,
    );
    return () => {
      window.clearTimeout(toReading);
      window.clearTimeout(toDone);
    };
  }, [phase]);

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

  async function copyText(kind: 'answer' | 'link') {
    const text =
      kind === 'link'
        ? window.location.href
        : result?.answer
          ? answerToText(result.answer, {
              question: `${t('answer.questionLabel')}: ${question}`,
              blocks: {
                answer: tc('answer.blocks.answer'),
                why: tc('answer.blocks.why'),
                what_to_check: tc('answer.blocks.what_to_check'),
                caveat: tc('answer.blocks.caveat'),
              },
              confidence: tc(
                `confidence.reasons.${result.confidence.reasonKey}`,
                result.confidence.reasonVars,
              ),
              sources: tc('answer.sourcesHeading'),
              notLegalAdvice: tc('footer.disclaimer'),
              demo: tc('answer.demoBadge'),
            })
          : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused. Saying nothing beats a false success.
      setCopied(null);
    }
  }

  function focusJurisdiction() {
    document.querySelector<HTMLElement>('[role="radiogroup"] [tabindex="0"]')?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-[80rem] px-5 py-8">
      <div className={cn(threeColumn ? null : 'mx-auto max-w-measure')}>
        <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-xl">{t('heading')}</h1>
          <span className="rounded-seal border border-lac px-2.5 py-0.5 text-xs text-lac">
            {t('notLegalAdvice')}
          </span>
        </header>
        <p className="mt-2 max-w-measure text-muted">{t('standfirst')}</p>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-xs text-muted">{t('jurisdictionLabel')}</p>
            <JurisdictionToggle
              aria-label={t('jurisdictionLabel')}
              value={jurisdiction}
              onChange={(next) => {
                setJurisdiction(next);
                if (hasAnswer) setPhase('searching');
              }}
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
            onEditJurisdiction={focusJurisdiction}
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

          {result ? (
            <section className="mt-8">
              <p className="text-xs text-muted">{t('answer.questionLabel')}</p>
              <p className="mt-1 max-w-measure text-md">{question}</p>

              <RetrievalStatus phase={phase} result={result} className="mt-4" />

              {phase === 'done' ? (
                <>
                  <Callout
                    tone="caution"
                    title={tc('answer.demoChip')}
                    titleLevel={2}
                    className="mt-5 max-w-measure"
                  >
                    {t('demoNotice')}
                  </Callout>

                  <LiveRegion urgency="polite" visuallyHidden>
                    {abstained
                      ? t(
                          `abstention.${result.confidence.abstainReason ?? 'nothing_relevant'}.title`,
                        )
                      : t('answer.announced', { count: result.answer?.citations.length ?? 0 })}
                  </LiveRegion>

                  {!isDesktop ? (
                    <Button
                      variant="secondary"
                      className="mt-6"
                      onClick={() => setSourcesOpen(true)}
                    >
                      {t('answer.sourcesButton')}
                      <Badge tone="sourced">
                        {(result.answer?.citations.length ?? 0) + result.relatedRecords.length}
                      </Badge>
                    </Button>
                  ) : null}

                  {abstained ? (
                    <Abstention
                      result={result}
                      onRephrase={() => composerRef.current?.focus()}
                      onPickJurisdiction={focusJurisdiction}
                      onNameProduct={() => setContextOpen(true)}
                      onEscalate={() => setEscalateOpen(true)}
                    />
                  ) : (
                    <>
                      <AnswerView
                        className="mt-6 lg:grid-cols-1"
                        headingLevel={2}
                        answer={result.answer!}
                        confidenceReason={tc(
                          `confidence.reasons.${result.confidence.reasonKey}`,
                          result.confidence.reasonVars,
                        )}
                        hideSources
                      />

                      {result.followUps.length > 0 ? (
                        <div className="mt-6">
                          <p className="text-xs text-muted">{t('followUps.heading')}</p>
                          <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                            {result.followUps.map((key) => (
                              <li key={key}>
                                <Chip onClick={() => ask(t(`followUps.${key}`))}>
                                  {t(`followUps.${key}`)}
                                </Chip>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}

                  <div className="mt-6 flex flex-wrap gap-2">
                    {!abstained ? (
                      <Button variant="quiet" size="sm" onClick={() => copyText('answer')}>
                        {copied === 'answer' ? t('answerActions.copied') : t('answerActions.copy')}
                      </Button>
                    ) : null}
                    <Button variant="quiet" size="sm" onClick={() => copyText('link')}>
                      {copied === 'link' ? t('answerActions.linked') : t('answerActions.link')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setEscalateOpen(true)}>
                      {t('escalate.open')}
                    </Button>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
        </div>

        {threeColumn && phase === 'done' && result ? (
          <div className="min-w-0">
            <AnswerPanel result={result} />
          </div>
        ) : null}
      </div>

      {result && !isDesktop && isTablet ? (
        <Drawer
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
          title={t('answer.sourcesTitle')}
        >
          <AnswerPanel result={result} />
        </Drawer>
      ) : null}

      {result && !isTablet ? (
        <BottomSheet
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
          title={t('answer.sourcesTitle')}
        >
          <AnswerPanel result={result} />
        </BottomSheet>
      ) : null}

      {result ? (
        <EscalationForm
          open={escalateOpen}
          onClose={() => setEscalateOpen(false)}
          result={result}
          productClass={tc(`productClass.${productClass}`)}
        />
      ) : null}
    </div>
  );
}

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
