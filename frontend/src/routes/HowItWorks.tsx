import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { AnswerView } from '@/components/answer';
import { PipelineDiagram } from '@/components/howitworks/PipelineDiagram';
import { type BuildState } from '@/components/ui';
import { Callout } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { DEMO_ANSWERS } from '@/services/answers.mock';
import { useEvalSummary } from '@/services/evals';

/**
 * The engineering page, and the only one allowed technical vocabulary.
 *
 * Its hardest constraint is that nothing here may claim a capability the code
 * does not have. Almost none of the pipeline is built, so almost every stage is
 * marked `designed, not built`, and the evaluation section shows no numbers
 * because no evaluation has been run. A page of metric definitions with no
 * results is less impressive than a table of figures and considerably more
 * honest, which is the argument this whole product is making.
 */

const ABSTENTION_STATES = ['nothing', 'scope', 'conflict', 'stale', 'facts'] as const;

type LayerKey = 'client' | 'api' | 'orchestrator' | 'stores' | 'corpus';

const ARCHITECTURE_LAYERS: ReadonlyArray<{ key: LayerKey; state: BuildState }> = [
  { key: 'client', state: 'live' },
  { key: 'api', state: 'live' },
  // Runs in full on every question, but over illustrative sources until
  // documents are ingested.
  { key: 'orchestrator', state: 'demo' },
  { key: 'stores', state: 'demo' },
  { key: 'corpus', state: 'demo' },
];

/**
 * Each row: the copy key on this page, and the key the harness writes.
 *
 * They differ because they are two vocabularies — the locale file names things
 * for a reader, the harness names them for whoever reads `evals/reports`. They
 * were the same string once, which meant every published figure silently read
 * "not measured" because the lookup missed.
 */
export const METRICS = [
  { key: 'jurisdictionPurity', summaryKey: 'jurisdiction_purity' },
  { key: 'authorityPurity', summaryKey: 'authority_purity' },
  { key: 'citationValidity', summaryKey: 'citation_validity' },
  { key: 'citationGroundedness', summaryKey: 'citation_groundedness' },
  { key: 'citationCoverage', summaryKey: 'citation_coverage' },
  { key: 'citationCorrectness', summaryKey: 'citation_correctness' },
  { key: 'abstentionPrecision', summaryKey: 'abstention_precision' },
  { key: 'abstentionRecall', summaryKey: 'abstention_recall' },
  { key: 'abstentionReason', summaryKey: 'abstention_reason_accuracy' },
  { key: 'forbiddenClaims', summaryKey: 'forbidden_claim_avoidance' },
  { key: 'classificationAccuracy', summaryKey: 'classification_accuracy' },
  { key: 'languageDetection', summaryKey: 'language_detection_accuracy' },
  { key: 'recordsOffered', summaryKey: 'records_offered' },
  { key: 'recordsDoNotRescue', summaryKey: 'records_do_not_rescue' },
  { key: 'answerAccuracy', summaryKey: 'answer_accuracy' },
  { key: 'multilingualQuality', summaryKey: 'multilingual_quality' },
  { key: 'latency', summaryKey: 'latency_p50' },
  { key: 'errors', summaryKey: 'errors' },
] as const;

const SECTIONS = [
  { anchor: 'pipeline', labelKey: 'pipeline.navLabel' },
  { anchor: 'why-retrieval', labelKey: 'retrieval.navLabel' },
  { anchor: 'abstention', labelKey: 'abstention.navLabel' },
  { anchor: 'jurisdictions', labelKey: 'jurisdictions.navLabel' },
  { anchor: 'architecture', labelKey: 'architecture.navLabel' },
  { anchor: 'evaluation', labelKey: 'evaluation.navLabel' },
] as const;

export default function HowItWorks() {
  const { t } = useTranslation('howitworks');
  const { t: tc } = useTranslation('common');
  useDocumentMeta(t('meta.title'), t('meta.description'));
  const pipelineId = useId();

  return (
    <article className="mx-auto max-w-[75rem] px-5 py-12">
      <header className="border-b border-rule-strong pb-6">
        <h1 className="text-2xl">{t('heading')}</h1>
        <p className="mt-3 max-w-measure text-md text-muted">{t('standfirst')}</p>
      </header>

      <nav aria-label={t('pipeline.navLabel')} className="mt-8 border-b border-rule pb-4">
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-base">
          {SECTIONS.map((section) => (
            <li key={section.anchor}>
              <a href={`#${section.anchor}`} className="rounded-data text-muted hover:text-leaf">
                {t(section.labelKey)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* 1 — the pipeline, interrogated one stage at a time. */}
      <section id="pipeline" className="mt-12 scroll-mt-8">
        <h2 className="text-xl">{t('pipeline.heading')}</h2>
        <p className="mt-3 max-w-measure text-muted">{t('pipeline.standfirst')}</p>
        <div className="mt-8">
          <PipelineDiagram idBase={pipelineId} />
        </div>
      </section>

      {/* 2 — why retrieval, including what it does not fix. */}
      <section id="why-retrieval" className="mt-16 scroll-mt-8 border-t border-rule pt-8">
        <h2 className="text-xl">{t('retrieval.heading')}</h2>
        <p className="mt-4 max-w-measure">{t('retrieval.body1')}</p>
        <p className="mt-4 max-w-measure">{t('retrieval.body2')}</p>

        <h3 className="mt-8 text-md">{t('retrieval.honestly')}</h3>
        <p className="mt-2 max-w-measure border-l-2 border-lac pl-4">{t('retrieval.body3')}</p>
      </section>

      {/* 3 — the abstention states, in the surface they will use. */}
      <section id="abstention" className="mt-16 scroll-mt-8 border-t border-rule pt-8">
        <h2 className="text-xl">{t('abstention.heading')}</h2>
        <p className="mt-3 max-w-measure text-muted">{t('abstention.standfirst')}</p>

        <div className="mt-8 space-y-5">
          {ABSTENTION_STATES.map((state) => (
            <div key={state} className="max-w-measure">
              <Callout tone="abstain" title={t(`abstention.states.${state}.title`)}>
                {t(`abstention.states.${state}.body`)}
              </Callout>
              <p className="mt-2 pl-3 text-xs text-muted">
                <span className="text-muted">{t('abstention.offers')}: </span>
                {t(`abstention.states.${state}.offers`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — two jurisdictions, side by side, never merged. */}
      <section id="jurisdictions" className="mt-16 scroll-mt-8 border-t border-rule pt-8">
        <h2 className="text-xl">{t('jurisdictions.heading')}</h2>
        <p className="mt-4 max-w-measure">{t('jurisdictions.body')}</p>

        <h3 className="mt-8 text-md">{t('jurisdictions.sideBySide')}</h3>
        <p className="mt-2 max-w-measure text-xs text-muted">{t('jurisdictions.note')}</p>

        <div className="mt-6 grid gap-8 xl:grid-cols-2">
          {(['IN', 'INTL'] as const).map((jurisdiction) => (
            <div key={jurisdiction} className="rounded-data border border-rule bg-surface p-4">
              <h4 className="text-base text-muted">
                {jurisdiction === 'IN' ? t('jurisdictions.inLabel') : t('jurisdictions.intlLabel')}
              </h4>
              <AnswerView
                className="mt-4 lg:grid-cols-1"
                headingLevel={5}
                answer={DEMO_ANSWERS[jurisdiction]}
                confidenceReason={tc('confidence.demoReason', {
                  count: DEMO_ANSWERS[jurisdiction].citations.length,
                })}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 5 — the layers, each with its state. */}
      <section id="architecture" className="mt-16 scroll-mt-8 border-t border-rule pt-8">
        <h2 className="text-xl">{t('architecture.heading')}</h2>
        <p className="mt-3 max-w-measure text-muted">{t('architecture.standfirst')}</p>

        <ol className="m-0 mt-8 list-none p-0">
          {ARCHITECTURE_LAYERS.map((layer) => (
            <li
              key={layer.key}
              className="border-l-2 border-rule-strong py-3 pl-4 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-md">{t(`architecture.layers.${layer.key}.name`)}</h3>
              </div>
              <p className="mt-1 max-w-measure text-muted">
                {t(`architecture.layers.${layer.key}.items`)}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-8 max-w-measure rounded-data border border-rule bg-surface-sunk p-4">
          <h3 className="text-base">{t('architecture.filtersHeading')}</h3>
          <p className="mt-1 text-muted">{t('architecture.filters')}</p>
        </div>

        <div className="mt-6 max-w-measure">
          <h3 className="text-base">{t('architecture.notScheduled')}</h3>
          <p className="mt-1 text-muted">{t('architecture.notScheduledBody')}</p>
        </div>
      </section>

      {/* 6 — the measures, and the absence of results. */}
      <section id="evaluation" className="mt-16 scroll-mt-8 border-t border-rule pt-8">
        <h2 className="text-xl">{t('evaluation.heading')}</h2>
        <p className="mt-3 max-w-measure text-muted">{t('evaluation.standfirst')}</p>
        <EvaluationTable />
      </section>
    </article>
  );
}

function EvaluationTable() {
  const { t } = useTranslation('howitworks');
  const evals = useEvalSummary();

  return (
    <>
      {evals.state === 'ready' ? (
        <>
          {evals.summary.caveat ? (
            <Callout
              tone="caution"
              title={t('evaluation.caveatTitle')}
              className="mt-6 max-w-measure"
            >
              {evals.summary.caveat}
            </Callout>
          ) : null}
          <p className="mt-6 text-xs text-muted">
            {t('evaluation.lastRun', { date: evals.summary.run_at })}
            {evals.summary.case_count
              ? ' \u00b7 ' + t('evaluation.caseCount', { count: evals.summary.case_count })
              : ''}
          </p>
        </>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-base">
          <thead>
            <tr className="border-b border-rule-strong text-left align-bottom">
              <th scope="col" className="w-[20%] py-2 pr-4 text-xs font-medium text-muted">
                {t('evaluation.colMetric')}
              </th>
              <th scope="col" className="w-[44%] py-2 pr-4 text-xs font-medium text-muted">
                {t('evaluation.colWhat')}
              </th>
              <th scope="col" className="w-[18%] py-2 pr-4 text-xs font-medium text-muted">
                {t('evaluation.colTarget')}
              </th>
              <th scope="col" className="w-[18%] py-2 text-xs font-medium text-muted">
                {t('evaluation.colResult')}
              </th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ key, summaryKey }) => {
              const result =
                evals.state === 'ready' ? evals.summary.metrics[summaryKey] : undefined;
              const measured = result !== undefined && result !== 'not measured';
              return (
                <tr key={key} className="border-b border-rule-faint align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-medium">
                    {t(`evaluation.metrics.${key}.name`)}
                  </th>
                  <td className="py-3 pr-4 text-muted">{t(`evaluation.metrics.${key}.what`)}</td>
                  <td className="py-3 pr-4">{t(`evaluation.metrics.${key}.target`)}</td>
                  <td className="py-3">
                    {measured ? (
                      result
                    ) : (
                      <span className="text-lac">{t('evaluation.noResult')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
