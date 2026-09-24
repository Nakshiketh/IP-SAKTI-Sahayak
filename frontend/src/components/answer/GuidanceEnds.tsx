import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Analysis, EscalationLevel } from '@/types/domain';

/**
 * Where guidance ends.
 *
 * The one block a jury is meant to remember. Everything else on the page says
 * what the system found; this says what it will not claim, and who should look
 * at the rest. A reader who takes only this away has taken away the true thing.
 *
 * The stepper is four states, not a score. L0 to L3 is how much of a person's
 * judgement this still needs, and the level shown is always the highest any
 * single issue reached — averaging would bury the one issue that needs help.
 */

const LEVELS: readonly EscalationLevel[] = ['l0', 'l1', 'l2', 'l3'];

/** Tone per level. Nothing red: needing a professional is normal, not a fault. */
const TONE: Record<EscalationLevel, string> = {
  l0: 'border-rule-strong bg-surface',
  l1: 'border-rule-strong bg-surface',
  l2: 'border-lac/40 bg-lac/[0.06]',
  l3: 'border-lac bg-lac/[0.10]',
};

export function GuidanceEnds({ analysis, className }: { analysis: Analysis; className?: string }) {
  const { t } = useTranslation('sahayak');
  const escalation = analysis.escalation;
  if (!escalation) return null;

  const reached = LEVELS.indexOf(escalation.level);
  const unresolved = analysis.conflicts.filter(
    (conflict) => conflict.resolution_status === 'unresolved',
  );

  return (
    <section
      aria-labelledby="guidance-ends-heading"
      className={cn('rounded-card border p-4 sm:p-5', TONE[escalation.level], className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="guidance-ends-heading" className="text-md">
          {t('guidanceEnds.heading')}
        </h3>
        <Badge tone={escalation.level === 'l0' ? 'sourced' : 'caution'}>
          {t(`guidanceEnds.level.${escalation.level}.label`)}
        </Badge>
      </div>

      {/* The stepper. Four fixed steps so the reader sees where this answer
          sits on a scale, not just a label with nothing to compare it to. */}
      <ol className="mt-3 flex gap-1" aria-label={t('guidanceEnds.stepperLabel')}>
        {LEVELS.map((level, index) => (
          <li key={level} className="flex-1">
            <div className={cn('h-1 rounded-full', index <= reached ? 'bg-ink/70' : 'bg-ink/15')} />
            <span className="sr-only">
              {t(`guidanceEnds.level.${level}.label`)}
              {index === reached ? ` — ${t('guidanceEnds.current')}` : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted">{t(`guidanceEnds.level.${escalation.level}.body`)}</p>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">{t('guidanceEnds.canSay')}</dt>
          <dd className="mt-1 text-sm">
            {t('guidanceEnds.canSayBody', {
              count: analysis.issues.filter((i) => i.status === 'indicated').length,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('guidanceEnds.cannotConclude')}</dt>
          <dd className="mt-1 text-sm">
            <ul className="space-y-1">
              <li>{t('guidanceEnds.cannotNovelty')}</li>
              <li>{t('guidanceEnds.cannotTkdl')}</li>
              {unresolved.length > 0 ? (
                <li>{t('guidanceEnds.cannotUnresolved', { count: unresolved.length })}</li>
              ) : null}
              {analysis.missing_facts.length > 0 ? (
                <li>
                  {t('guidanceEnds.cannotMissingFacts', { count: analysis.missing_facts.length })}
                </li>
              ) : null}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('guidanceEnds.whoReviews')}</dt>
          <dd className="mt-1 text-sm">
            {escalation.specialists.length === 0 ? (
              t('guidanceEnds.noReviewNeeded')
            ) : (
              <ul className="space-y-1">
                {escalation.specialists.map((specialist) => (
                  <li key={specialist}>{t(`guidanceEnds.specialist.${specialist}`, specialist)}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>

      {analysis.missing_facts.length > 0 ? (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="text-xs text-muted">{t('guidanceEnds.wouldSettle')}</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {analysis.missing_facts.map((fact) => (
              <li key={fact.key}>{fact.question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
