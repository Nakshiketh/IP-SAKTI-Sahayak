import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { askHref, toolHref } from '@/components/home/patentSteps';
import { SectionSourceList, SourceScope, Src } from '@/components/sourcing/Sourced';
import { Button, Callout } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  likelyProductClass,
  type Assessment,
  type AssessmentInput,
  type RecordMatch,
} from '@/services/assessment';
import { CLASSICAL_FORMULATIONS, TRADITIONAL_INGREDIENTS } from '@/services/assessmentReference';
import { RECORDS_SOURCES } from '@/services/recordsManifest';

/**
 * The result: one headline, what was checked, then each kind of protection on
 * its own terms.
 *
 * The four sections are deliberately not four copies of one card. A patent
 * finding is a reference with reasons; a trade mark note is about a name and its
 * classes; copyright and trade secret are about what the reader already has.
 * They arrive in sequence once, because the reader asked for them — never on
 * scroll.
 */

import { CHECKS, type CheckId } from '@/components/assessment/checks';
export type { CheckId };

type Style = React.CSSProperties & Record<`--${string}`, string | number>;
const at = (i: number): Style => ({ '--i': i });

export function RunningChecks({
  done,
  headingRef,
}: {
  done: readonly CheckId[];
  headingRef: React.RefObject<HTMLHeadingElement>;
}) {
  const { t } = useTranslation('assessment');
  const active = CHECKS.find((check) => !done.includes(check));

  return (
    <div aria-busy="true">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg outline-none">
        {t('running.heading')}
      </h2>
      <ol className="m-0 mt-6 list-none space-y-3 p-0">
        {CHECKS.map((check) => {
          const finished = done.includes(check);
          const running = check === active;
          return (
            <li key={check} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-seal border',
                  finished ? 'border-leaf bg-leaf text-bone' : 'border-rule-strong text-muted',
                )}
              >
                {finished ? (
                  <Check size={14} strokeWidth={2.5} className="route-swap" />
                ) : running ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
              </span>
              <span className={cn('text-base', finished || running ? 'text-ink' : 'text-muted')}>
                {t(`running.${check}`)}
                {finished ? <span className="sr-only">: {t('running.done')}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {/* A blank ruled leaf while it works, the product's waiting state. */}
      <div aria-hidden="true" className="mt-8 space-y-3">
        <div className="leaf-line" />
        <div className="leaf-line w-4/5" />
        <div className="leaf-line w-3/5" />
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  similar: 'text-lac bg-lac/[0.08] border-lac/40',
  check: 'text-lac bg-lac/[0.08] border-lac/40',
  possible: 'text-leaf bg-leaf/[0.08] border-leaf/40',
  relevant: 'text-leaf bg-leaf/[0.08] border-leaf/40',
  limited: 'text-muted bg-surface-sunk border-rule-strong',
  clear: 'text-muted bg-surface-sunk border-rule-strong',
  none: 'text-muted bg-surface-sunk border-rule-strong',
};

function Status({ status }: { status: keyof typeof STATUS_TONE }) {
  const { t } = useTranslation('assessment');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-control border px-2 py-0.5 text-xs font-medium',
        STATUS_TONE[status],
      )}
    >
      {t(`result.status.${status as 'similar'}`)}
    </span>
  );
}

/** A reference and the reasons it is here, in the order the reader needs them. */
function Finding({ rows }: { rows: [label: string, value: React.ReactNode][] }) {
  return (
    <dl className="m-0 mt-4 rounded-data border border-lac/40 bg-surface">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid gap-x-4 gap-y-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0 sm:grid-cols-[11rem_1fr]"
        >
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="m-0 text-base">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function IpSection({
  index,
  type,
  status,
  children,
}: {
  index: number;
  type: 'patent' | 'trademark' | 'copyright' | 'tradeSecret';
  status: keyof typeof STATUS_TONE;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('assessment');
  const id = `result-${type}`;
  return (
    <section aria-labelledby={id} className="result-rise border-t border-rule pt-6" style={at(index)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="text-md">
          {t(`result.ip.${type}.title`)}
        </h3>
        <Status status={status} />
      </div>
      <p className="mt-1 text-xs text-muted">{t(`result.ip.${type}.question`)}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ResultView({
  assessment: a,
  input,
  headingRef,
  onRetry,
}: {
  assessment: Assessment;
  input: AssessmentInput;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onRetry: () => void;
}) {
  const { t } = useTranslation('assessment');
  const { t: tc } = useTranslation('common');
  const list = (items: string[]) => items.join(', ');

  const recordRows = (match: RecordMatch, investigate: string): [string, React.ReactNode][] => [
    [t('result.finding.type'), t('result.recordType', { type: tc(`recordType.${match.record.record_type}`) })],
    [
      t('result.finding.reference'),
      <>
        <span className="block">{match.record.title}</span>
        <span className="block text-xs text-muted">
          {[match.record.applicant, match.record.status].filter(Boolean).join(', ')}
        </span>
        <span className="mt-1 block text-xs text-muted">
          {tc('record.notAuthority', { date: match.record.snapshot_at?.slice(0, 10) ?? '—' })}
        </span>
      </>,
    ],
    [t('result.finding.why'), t('result.whyRecord', { terms: list(match.matched) })],
    [t('result.finding.overlap'), list(match.aspects.map((aspect) => t(`result.overlap.${aspect}`)))],
    [t('result.finding.investigate'), investigate],
  ];

  const registries = RECORDS_SOURCES.filter(
    (source) =>
      source.access_mode === 'portal_link_only' &&
      ['patent_application', 'patent_grant', 'trademark', 'design'].includes(source.record_type),
  );

  return (
    <div>
      {/* The headline. Caution when something overlaps; neutral, never green,
          when nothing does — "nothing found here" is not "all clear". */}
      <div
        className={cn(
          'result-rise rounded-control border-l-4 p-4 sm:p-5',
          a.similarFound ? 'border-lac bg-lac/[0.06]' : 'border-ink/70 bg-surface-sunk',
        )}
        style={at(0)}
      >
        <h2 ref={headingRef} tabIndex={-1} className={cn('text-lg outline-none', a.similarFound && 'text-lac')}>
          {a.similarFound ? t('result.similarHeading') : t('result.noneHeading')}
        </h2>
        <p className="mt-2">{a.similarFound ? t('result.similarBody') : t('result.noneBody')}</p>
      </div>

      <div className="result-rise mt-6" style={at(1)}>
        <h3 className="text-base font-medium">{t('result.scopeHeading')}</h3>
        <ul className="m-0 mt-2 list-none space-y-1.5 p-0 text-base">
          <li className="border-l-2 border-rule-strong pl-3">
            {a.records.state === 'searched'
              ? t('result.scopeRecords', {
                  count: a.records.recordCount,
                  terms: list(input.ingredients.slice(0, 4)),
                })
              : a.records.state === 'empty'
                ? t('result.scopeRecordsEmpty')
                : t('result.scopeRecordsFailed')}
            {a.records.state === 'failed' ? (
              <Button variant="quiet" size="sm" className="ml-1" onClick={onRetry}>
                {t('actions.retry')}
              </Button>
            ) : null}
          </li>
          <li className="border-l-2 border-rule-strong pl-3">
            {t('result.scopeKnowledge', {
              ingredients: TRADITIONAL_INGREDIENTS.length,
              formulations: CLASSICAL_FORMULATIONS.length,
            })}
          </li>
          {input.brand === 'yes' ? (
            <li className="border-l-2 border-rule-strong pl-3">{t('result.scopeName')}</li>
          ) : null}
          <li className="border-l-2 border-lac pl-3 text-muted">{t('result.scopeNot')}</li>
        </ul>
        <p className="mt-4 text-muted">{t('result.multiple')}</p>
      </div>

      <div className="mt-8 space-y-8">
        {/* -- Patent */}
        <IpSection index={2} type="patent" status={a.patent.status}>
          <SourceScope documentIds={['in-patents-act-1970', 'in-tk-biological-material-guidelines']}>
            {a.patent.classical.map((match) => (
              <Finding
                key={match.formulation.id}
                rows={[
                  [t('result.finding.type'), t('result.priorArtType')],
                  [t('result.finding.reference'), t('result.classicalReference', { name: match.formulation.label })],
                  [
                    t('result.finding.why'),
                    match.via === 'name'
                      ? t('result.whyName', { match: match.formulation.label })
                      : t('result.whyIngredients', {
                          list: list(
                            (match.formulation.ingredients ?? []).map(
                              (id) => TRADITIONAL_INGREDIENTS.find((i) => i.id === id)?.label ?? id,
                            ),
                          ),
                        }),
                  ],
                  [t('result.finding.overlap'), t('result.overlap.ingredients')],
                  [t('result.finding.investigate'), t('result.investigateClassical')],
                ]}
              />
            ))}
            {a.patent.records.map((match) => (
              <Finding key={match.record.record_id} rows={recordRows(match, t('result.investigateRecord'))} />
            ))}

            {a.patent.status !== 'similar' ? (
              <p className="max-w-measure">
                {a.patent.status === 'possible' ? t('result.patentPossible') : t('result.patentLimited')}
              </p>
            ) : null}

            <div className="mt-4 space-y-1 text-base">
              {a.patent.known.length > 0 ? (
                <p className="text-muted">
                  {t('result.patentKnown', { list: list(a.patent.known.map((k) => k.label)) })}
                </p>
              ) : null}
              {a.patent.unrecognised.length > 0 ? (
                <p className="text-muted">
                  {t('result.patentUnrecognised', { list: list(a.patent.unrecognised) })}
                </p>
              ) : null}
            </div>

            {a.patent.considerations.length > 0 ? (
              <>
                <h4 className="mt-5 text-base font-medium">{t('result.considerHeading')}</h4>
                <ul className="m-0 mt-2 list-none space-y-2 p-0">
                  {a.patent.considerations.map((key) => (
                    <li key={key} className="border-l-2 border-leaf pl-3">
                      {t(`result.consider.${key}`)}
                      {key === 'tk' ? (
                        <>
                          <Src doc="in-patents-act-1970" />
                          <Src doc="in-tk-biological-material-guidelines" />
                        </>
                      ) : key === 'admixture' || key === 'knownForm' || key === 'disclosed' ? (
                        <Src doc="in-patents-act-1970" />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <SectionSourceList />
          </SourceScope>
        </IpSection>

        {/* -- Trade mark */}
        <IpSection index={3} type="trademark" status={a.trademark.status}>
          <SourceScope documentIds={['in-trade-marks-act-1999']}>
            {a.trademark.records.map((match) => (
              <Finding key={match.record.record_id} rows={recordRows(match, t('result.investigateMark'))} />
            ))}
            {a.trademark.status === 'none' ? (
              <p>{t('result.markNone')}</p>
            ) : (
              <div className="space-y-2">
                {a.trademark.descriptive.length > 0 ? (
                  <p className="border-l-2 border-lac pl-3">
                    {t('result.markDescriptive', { list: list(a.trademark.descriptive) })}
                    <Src doc="in-trade-marks-act-1999" />
                  </p>
                ) : null}
                {a.trademark.classical.length > 0 ? (
                  <p className="border-l-2 border-lac pl-3">
                    {t('result.markClassical', { list: list(a.trademark.classical) })}
                    <Src doc="in-trade-marks-act-1999" />
                  </p>
                ) : null}
                {a.trademark.status === 'clear' ? <p>{t('result.markClear')}</p> : null}
                <h4 className="pt-2 text-base font-medium">{t('result.classesHeading')}</h4>
                <ul className="m-0 list-none space-y-1 p-0">
                  {a.trademark.classes.map((cls) => (
                    <li key={cls} className="text-base">
                      {t(`result.class.${cls as 3}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SectionSourceList />
          </SourceScope>
        </IpSection>

        {/* -- Copyright */}
        <IpSection index={4} type="copyright" status={a.copyright.status}>
          {a.copyright.status === 'relevant' ? (
            <>
              <p>{t('result.copyrightRelevant')}</p>
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                {a.copyright.works.map((work) => (
                  <li key={work} className="rounded-control border border-rule-strong px-2.5 py-1 text-xs">
                    {t(`protection.work.${work}`)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t('result.copyrightNone')}</p>
          )}
        </IpSection>

        {/* -- Trade secret */}
        <IpSection index={5} type="tradeSecret" status={a.tradeSecret.status}>
          {a.tradeSecret.status === 'relevant' ? (
            <>
              <p>{t('result.secretRelevant')}</p>
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                {a.tradeSecret.items.map((item) => (
                  <li key={item} className="rounded-control border border-rule-strong px-2.5 py-1 text-xs">
                    {t(`protection.secret.${item}`)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>{t('result.secretNone')}</p>
          )}
          {a.tradeSecret.tradeOff ? (
            <Callout tone="caution" title={t('result.ip.tradeSecret.title')} titleLevel={4} className="mt-4">
              {t('result.tradeOff')}
            </Callout>
          ) : null}
        </IpSection>
      </div>

      {/* -- What next. A sequence, so it is numbered. */}
      <section aria-labelledby="result-next" className="result-rise mt-10 rounded-data border border-rule bg-surface-sunk p-5" style={at(6)}>
        <h3 id="result-next" className="text-md">
          {t('result.nextHeading')}
        </h3>
        <ol className="m-0 mt-4 list-none space-y-3 p-0">
          {a.nextSteps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span
                aria-hidden="true"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-seal border border-leaf text-xs font-medium tabular-nums text-leaf"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p>{t(`result.next.${step}`)}</p>
                {step === 'confirmClass' ? (
                  <p className="mt-1 text-xs text-muted">
                    {t('result.likelyClass', {
                      class: tc(`productClass.${likelyProductClass(input.category)}`),
                    })}{' '}
                    <Link to={toolHref('classify')} className="text-leaf underline underline-offset-4">
                      {t('result.confirmClassLink')}
                    </Link>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <h4 className="mt-6 text-base font-medium">{t('result.registriesHeading')}</h4>
        <p className="mt-0.5 text-xs text-muted">{t('result.registriesNote')}</p>
        <ul className="m-0 mt-2 grid list-none gap-x-6 gap-y-1.5 p-0 sm:grid-cols-2">
          {registries.map((source) => (
            <li key={source.source_id} className="text-xs">
              <span className="block text-ink">{source.name}</span>
              <span className="block text-muted">{source.publisher}</span>
            </li>
          ))}
        </ul>

        <Link
          to={askHref(
            t('result.askQuestion', {
              category: t(`category.options.${input.category ?? 'other'}.label`).toLowerCase(),
              ingredients: list(input.ingredients.slice(0, 3)),
            }),
          )}
          className="mt-5 inline-block text-base text-leaf underline underline-offset-4"
        >
          {t('result.askLink')}
        </Link>
      </section>
    </div>
  );
}
