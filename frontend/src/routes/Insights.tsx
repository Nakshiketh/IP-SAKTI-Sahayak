import { useTranslation } from 'react-i18next';

import { PageIntro, PageShell } from '@/components/layout/PageIntro';
import { Callout } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { type Bucket, type Insight, useInsight } from '@/services/insight';

/**
 * Where this product is used, where it works, and where it does not.
 *
 * Written for whoever runs a deployment rather than whoever uses it, and built
 * so that it cannot become a way to read what anyone asked. The audit log holds
 * a hash of each question and never the words, so there is nothing here to
 * leak — but the page still states the two rules it is bound by, because a
 * reader looking at a usage dashboard is entitled to know what it can see.
 *
 * Two presentation rules follow from that:
 *
 * A bucket below the threshold is not shown, and the *number* of hidden buckets
 * is. Silently dropping them would leave a reader believing the totals add up.
 *
 * A rate with no data behind it renders as a dash, never as 0%. Nobody having
 * asked anything is a different fact from nothing having been abstained on, and
 * this page will not turn the first into the second.
 */
export default function Insights() {
  const { t } = useTranslation('common');
  const { result, reload } = useInsight();
  useDocumentMeta(t('insights.meta.title'), t('insights.meta.description'));

  return (
    <PageShell>
      <PageIntro heading={t('insights.heading')} standfirst={t('insights.standfirst')} />

      {result.state === 'loading' ? (
        <p className="mt-8 text-base text-muted">{t('insights.loading')}</p>
      ) : null}

      {result.state === 'disabled' ? (
        <Callout tone="info" title={t('insights.disabled.heading')} className="mt-8">
          {t('insights.disabled.body')}
        </Callout>
      ) : null}

      {result.state === 'forbidden' ? (
        <Callout tone="info" title={t('insights.forbidden.heading')} className="mt-8">
          {t('insights.forbidden.body')}
        </Callout>
      ) : null}

      {result.state === 'unreachable' ? (
        <Callout tone="caution" title={t('insights.unreachable.heading')} className="mt-8">
          {t('insights.unreachable.body')}{' '}
          <button type="button" className="underline underline-offset-2" onClick={reload}>
            {t('insights.retry')}
          </button>
        </Callout>
      ) : null}

      {result.state === 'ready' ? <Numbers insight={result.insight} /> : null}
    </PageShell>
  );
}

/** A rate, or a dash. Never 0% standing in for "nobody has asked yet". */
function rate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function millis(value: number | null): string {
  return value === null ? '—' : `${value} ms`;
}

function Numbers({ insight }: { insight: Insight }) {
  const { t } = useTranslation('common');

  if (insight.total_queries === 0) {
    return (
      <Callout tone="info" title={t('insights.empty.heading')} className="mt-8">
        {t('insights.empty.body')}
      </Callout>
    );
  }

  return (
    <>
      <p className="mt-8 text-xs uppercase tracking-wide text-muted">{insight.provenance}</p>

      <dl className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <Figure label={t('insights.figures.total')} value={String(insight.total_queries)} />
        <Figure label={t('insights.figures.abstention')} value={rate(insight.abstention_rate)} />
        <Figure label={t('insights.figures.escalation')} value={rate(insight.escalation_rate)} />
        <Figure label={t('insights.figures.refusal')} value={rate(insight.refusal_rate)} />
        <Figure label={t('insights.figures.p50')} value={millis(insight.latency_p50_ms)} />
        <Figure label={t('insights.figures.p95')} value={millis(insight.latency_p95_ms)} />
      </dl>

      {/* Said before the tables, not in a footnote under them: a reader who has
          already added the columns up has been misled by the time they reach it. */}
      <Callout tone="info" title={t('insights.suppressed.heading')} className="mt-10">
        {t('insights.suppressed.body', {
          minimum: insight.minimum_bucket,
          count: insight.suppressed_buckets,
        })}
      </Callout>

      <Counts heading={t('insights.byJurisdiction')} buckets={insight.by_jurisdiction} />
      <Counts heading={t('insights.byLanguage')} buckets={insight.by_language} />
      <Counts heading={t('insights.bySource')} buckets={insight.most_used_sources} />

      <section className="mt-10">
        <h2 className="text-lg">{t('insights.gaps.heading')}</h2>
        <p className="mt-2 max-w-measure text-base text-muted">{t('insights.gaps.standfirst')}</p>
        {insight.knowledge_gaps.length === 0 ? (
          <p className="mt-4 text-base text-muted">{t('insights.gaps.none')}</p>
        ) : (
          <ul className="m-0 mt-4 list-none space-y-3 p-0">
            {insight.knowledge_gaps.map((gap) => (
              <li key={gap.reason} className="border-l-2 border-rule-strong pl-3 text-base">
                <span className="font-medium">{gap.count}</span>{' '}
                {t('insights.gaps.row', { reason: gap.reason })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-rule pt-3">
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 font-display text-lg">{value}</dd>
    </div>
  );
}

function Counts({ heading, buckets }: { heading: string; buckets: Bucket[] }) {
  const { t } = useTranslation('common');
  return (
    <section className="mt-10">
      <h2 className="text-lg">{heading}</h2>
      {buckets.length === 0 ? (
        <p className="mt-3 text-base text-muted">{t('insights.noBuckets')}</p>
      ) : (
        <ul className="m-0 mt-3 list-none space-y-2 p-0">
          {buckets.map((bucket) => (
            <li key={bucket.name} className="flex justify-between border-b border-rule pb-2">
              <span className="text-base">{bucket.name}</span>
              <span className="text-base tabular-nums text-muted">{bucket.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
