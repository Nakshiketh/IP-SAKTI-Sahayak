import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { AnswerView } from '@/components/answer';
import { ConflictMatrix } from '@/components/answer/ConflictMatrix';
import { GuidanceEnds } from '@/components/answer/GuidanceEnds';
import { AbsFlow } from '@/components/flows/AbsFlow';
import { ClassificationFlow } from '@/components/flows/ClassificationFlow';
import { FlowOffers, type FlowKind } from '@/components/flows/FlowOffer';
import { PriorArtFlow } from '@/components/flows/PriorArtFlow';
import { Abstention } from '@/components/sahayak/Abstention';
import { AnswerPanel } from '@/components/sahayak/AnswerPanel';
import { Composer } from '@/components/sahayak/Composer';
import { ContextLine } from '@/components/sahayak/ContextLine';
import { EscalationForm } from '@/components/sahayak/EscalationForm';
import { QueryFailure } from '@/components/sahayak/QueryFailure';
import {
  RetrievalStatus,
  type RetrievalCount,
  type StatusPhase,
} from '@/components/sahayak/RetrievalStatus';
import { StarterQuestions } from '@/components/sahayak/StarterQuestions';
import {
  Badge,
  BottomSheet,
  Button,
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
import { QueryError, runQuery, type QueryErrorCode, type QueryResult } from '@/services/query';
import { sessionId } from '@/services/session';
import { PRODUCT_CLASSES, type Jurisdiction, type ProductClass } from '@/types/domain';

/**
 * The workspace.
 *
 * One centred column until an answer exists; three at desktop width once it
 * does. Zero decisions before the first answer.
 *
 * The answer surface is real: confidence is computed from the evidence, and an
 * abstention is a first-class outcome rather than an error toast. Asking is now
 * a real request against the API, which streams its stages as it runs, and the
 * two status lines report what actually happened rather than a delay.
 *
 * Failing and abstaining are kept apart here as firmly as anywhere in the
 * product. An abstention renders through `Abstention` with a reason and what to
 * do next; a failure renders through `QueryFailure` with a retry. Nothing
 * collapses them into one "sorry" state.
 */

const MARKETS = ['uk', 'eu', 'us'] as const;
type Market = (typeof MARKETS)[number];

/**
 * A flow named in the address. The homepage's patent steps link here with
 * `?flow=priorArt` or `?flow=classify`, so a reader at that step lands in the
 * tool rather than being told it exists. Anything not a known flow is ignored.
 */
const FLOW_KINDS: readonly FlowKind[] = ['classify', 'abs', 'priorArt'];

function flowFromParam(value: string | null): FlowKind | null {
  return FLOW_KINDS.find((kind) => kind === value) ?? null;
}

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
  const [result, setResult] = useState<QueryResult | null>(null);
  const [failure, setFailure] = useState<QueryErrorCode | null>(null);
  const [found, setFound] = useState<RetrievalCount | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openFlow, setOpenFlow] = useState<FlowKind | null>(() =>
    flowFromParam(params.get('flow')),
  );
  const [copied, setCopied] = useState<'answer' | 'link' | null>(null);

  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);

  const hasAnswer = question.length > 0;
  const threeColumn = hasAnswer && isDesktop;
  const abstained = result !== null && result.answer === null;

  /**
   * Which flows this particular answer leaves open. An offer appears because the
   * answer needed it, at the moment the reader has just met the gap it fills.
   */
  const offeredFlows = useMemo<FlowKind[]>(() => {
    if (!result) return [];
    const kinds: FlowKind[] = [];
    if (productClass === 'undetermined') kinds.push('classify');
    const answer = result.answer;
    if (answer?.regulatory_areas.includes('abs_compliance')) kinds.push('abs');
    if (answer?.ip_rights.includes('patent')) kinds.push('priorArt');
    // An abstention that turns on the product type is exactly when to offer it.
    if (result.confidence.abstainReason === 'needs_more_facts' && !kinds.includes('classify')) {
      kinds.unshift('classify');
    }
    return kinds;
  }, [result, productClass]);

  const ask = useCallback(
    (text: string) => {
      setQuestion(text);
      setParams({ q: text }, { replace: true });
      setStartersOpen(false);
      setAttempt((n) => n + 1);
    },
    [setParams],
  );

  /**
   * Closing a flow also takes it out of the address, so reloading or sharing the
   * page afterwards does not reopen a panel the reader already dismissed.
   */
  const closeFlow = useCallback(() => {
    setOpenFlow(null);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('flow');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  /**
   * One request per question, jurisdiction, product type and answer language.
   *
   * Changing any of them is a different question of the sources, so it is asked
   * again rather than filtered client-side. The previous request is aborted, so
   * a slow answer to an abandoned question can never overwrite a fast one.
   */
  useEffect(() => {
    if (!question) return;
    const controller = new AbortController();
    setPhase('searching');
    setResult(null);
    setFailure(null);
    setFound(null);

    runQuery(question, {
      jurisdiction,
      productClass,
      languageOut: language,
      sessionId: sessionId(),
      signal: controller.signal,
      onRetrieved: (count) => {
        setFound(count);
        setPhase('reading');
      },
    })
      .then((next) => {
        setResult(next);
        setPhase('done');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailure(error instanceof QueryError ? error.code : 'unknown');
        setPhase('done');
      });

    return () => controller.abort();
  }, [question, jurisdiction, productClass, language, attempt]);

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
              demo: tc('answer.sourceNote'),
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

          {hasAnswer ? (
            <section className="mt-8">
              <p className="text-xs text-muted">{t('answer.questionLabel')}</p>
              <p className="mt-1 max-w-measure text-md">{question}</p>

              <RetrievalStatus
                phase={phase}
                result={result}
                jurisdiction={jurisdiction}
                found={found}
                className="mt-4"
              />

              {failure !== null ? (
                <QueryFailure code={failure} onRetry={() => setAttempt((n) => n + 1)} />
              ) : null}

              {phase === 'done' && result ? (
                <>
                  {/* A source note, not an alarm. The provenance has to be on the
                      answer — the citations name real statutes and the passages
                      behind them are not yet the documents themselves — but it
                      belongs in the register a publication uses for a footnote,
                      not in a warning box above the thing it qualifies. It is
                      rendered under the answer by `AnswerView`. */}

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
                    <>
                      <Abstention
                        result={result}
                        onRephrase={() => composerRef.current?.focus()}
                        onPickJurisdiction={focusJurisdiction}
                        onNameProduct={() => setContextOpen(true)}
                        onEscalate={() => setEscalateOpen(true)}
                      />
                      <FlowOffers kinds={offeredFlows} onOpen={setOpenFlow} />
                    </>
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

                      {/* Where guidance ends comes before the overlaps: a
                          reader should know what this will not claim before
                          they read the detail of what it did find. */}
                      {result.answer!.analysis ? (
                        <>
                          <GuidanceEnds className="mt-6" analysis={result.answer!.analysis} />
                          <ConflictMatrix
                            className="mt-6"
                            analysis={result.answer!.analysis}
                            citations={result.answer!.citations}
                          />
                        </>
                      ) : null}

                      <FlowOffers kinds={offeredFlows} onOpen={setOpenFlow} />

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

      <ClassificationFlow
        open={openFlow === 'classify'}
        onClose={closeFlow}
        onApply={(next) => setProductClass(next)}
      />
      <AbsFlow open={openFlow === 'abs'} onClose={closeFlow} />
      <PriorArtFlow open={openFlow === 'priorArt'} onClose={closeFlow} />

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
