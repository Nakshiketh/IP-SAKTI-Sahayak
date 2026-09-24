import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { buttonStyles } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Answer } from '@/types/domain';

/**
 * What a professional would need to pick this up.
 *
 * One page, in the order somebody reviewing it would want: the question, the
 * facts as the system read them, what is missing, what it concluded, what it
 * could not settle, and the sources with their excerpts. It exists so the
 * handover is not a screenshot and a phone call.
 *
 * Printing is the browser's, through a print stylesheet. A PDF library would
 * add hundreds of kilobytes to give a worse result than the thing every browser
 * already does well, and the output would be one more artefact to keep true.
 *
 * "Facts stated" is the section most worth reading first. It shows what the
 * system believed about the case, in the reader's own words, so a wrong reading
 * is caught before anyone acts on what followed from it.
 */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid border-t border-rule pt-4">
      <h3 className="text-sm text-muted">{title}</h3>
      <div className="mt-1.5 text-sm">{children}</div>
    </section>
  );
}

export function CaseBrief({
  answer,
  question,
  className,
}: {
  answer: Answer;
  question: string;
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const analysis = answer.analysis;

  const summary = [
    `${t('brief.heading')} — ${answer.answer_id}`,
    `${t('brief.sections.question')}: ${question}`,
    analysis
      ? `${t('brief.sections.classification')}: ${tc(`productClass.${analysis.product_class}`, analysis.product_class)}`
      : '',
    analysis && analysis.missing_facts.length > 0
      ? `${t('brief.sections.missing')}: ${analysis.missing_facts.map((f) => f.question).join(' ')}`
      : '',
    `${t('brief.sections.sources')}: ${[...new Set(answer.citations.map((c) => c.document_title))].join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A refused clipboard is the browser's decision, not a failure worth
      // interrupting the page for. The text is on screen to select by hand.
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(answer, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `case-brief-${answer.answer_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className={cn('print:text-black', className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg">{t('brief.heading')}</h2>
          <p className="mt-1 max-w-measure text-sm text-muted">{t('brief.standfirst')}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={copy} className={buttonStyles({ variant: 'secondary' })}>
            {copied ? t('brief.copied') : t('brief.copy')}
          </button>
          <button
            type="button"
            onClick={exportJson}
            className={buttonStyles({ variant: 'secondary' })}
          >
            {t('brief.exportJson')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonStyles({ variant: 'secondary' })}
          >
            {t('brief.print')}
          </button>
        </div>
      </header>

      <div className="mt-5 space-y-4">
        <Section title={t('brief.sections.question')}>{question}</Section>

        <Section title={t('brief.sections.facts')}>
          {!analysis || analysis.facts.length === 0 ? (
            t('brief.noFacts')
          ) : (
            <ul className="space-y-1">
              {analysis.facts.map((fact) => (
                <li key={fact.key}>
                  {fact.key}: {String(fact.value)} — <span className="text-muted">“{fact.span}”</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('brief.sections.missing')}>
          {!analysis || analysis.missing_facts.length === 0 ? (
            t('brief.noneMissing')
          ) : (
            <ul className="space-y-1">
              {analysis.missing_facts.map((fact) => (
                <li key={fact.key}>{fact.question}</li>
              ))}
            </ul>
          )}
        </Section>

        {analysis ? (
          <Section title={t('brief.sections.classification')}>
            <p>{tc(`productClass.${analysis.product_class}`, analysis.product_class)}</p>
            {analysis.alternative_classes.length > 0 ? (
              <p className="mt-1 text-muted">
                {t('brief.candidates', {
                  classes: analysis.alternative_classes
                    .map((cls) => tc(`productClass.${cls}`, cls))
                    .join(', '),
                })}
              </p>
            ) : null}
            {analysis.changes_if ? <p className="mt-1 text-muted">{analysis.changes_if}</p> : null}
          </Section>
        ) : null}

        {analysis ? (
          <Section title={t('brief.sections.issues')}>
            <ul className="space-y-1">
              {analysis.issues
                .filter((issue) => issue.status === 'indicated')
                .map((issue) => (
                  <li key={issue.issue}>
                    {t(`issues.${issue.issue}`)}
                    {issue.confidence ? ` — ${tc(`confidence.${issue.confidence}`)}` : ''}
                  </li>
                ))}
            </ul>
          </Section>
        ) : null}

        {analysis ? (
          <Section title={t('brief.sections.conflicts')}>
            {analysis.conflicts.length === 0 ? (
              t('brief.noConflicts')
            ) : (
              <ul className="space-y-1">
                {analysis.conflicts.map((conflict) => (
                  <li key={conflict.conflict_id}>
                    {conflict.source_a} / {conflict.source_b} —{' '}
                    {t(`conflicts.resolution.${conflict.resolution_status}`)}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        <Section title={t('brief.sections.sources')}>
          <ul className="space-y-2">
            {answer.citations.map((citation) => (
              <li key={citation.citation_id}>
                <p>{citation.document_title}</p>
                <p className="text-xs text-muted">
                  {citation.organization}
                  {citation.section_label ? ` · ${citation.section_label}` : ''}
                  {citation.url ? ` · ${citation.url}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {analysis?.escalation ? (
          <Section title={t('brief.sections.specialists')}>
            <p>{t(`guidanceEnds.level.${analysis.escalation.level}.label`)}</p>
            <ul className="mt-1 space-y-1">
              {analysis.escalation.specialists.map((specialist) => (
                <li key={specialist}>{t(`guidanceEnds.specialist.${specialist}`, specialist)}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title={t('brief.sections.audit')}>
          <p className="text-muted">
            {answer.answer_id} · {answer.corpus_version} · {answer.as_of_date}
          </p>
        </Section>
      </div>

      <p className="mt-6 text-xs text-muted">
        {t('brief.printed', { date: new Date().toISOString().slice(0, 10) })}
      </p>
    </article>
  );
}
