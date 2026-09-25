import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { RoadmapTask } from '@/services/analyst';

/**
 * What to do, in the order the obligations actually bite.
 *
 * Grouped by when rather than by issue, because a reader working through this
 * wants to know what is in front of them now and what can wait until they file.
 *
 * The status a task cannot have is the important one. Nothing here is ever
 * "filed" or "approved": this product cannot see either, and a checklist that
 * let someone tick "approved" would record a belief and then show it back as
 * though it had been verified. The furthest a task goes is "done — your
 * record", which says whose assertion it is.
 */

const WHEN_ORDER = ['now', 'before_filing', 'before_sale'] as const;

const TONE: Record<string, 'sourced' | 'caution' | 'neutral'> = {
  ready: 'sourced',
  completed_by_user: 'sourced',
  needs_information: 'caution',
  requires_expert_review: 'caution',
  not_started: 'neutral',
};

function Task({ task }: { task: RoadmapTask }) {
  const { t } = useTranslation('analyst');
  return (
    <li className="rounded-card border border-rule bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">{t(`roadmap.task.${task.task_id}`, task.task_id)}</p>
        <Badge tone={TONE[task.status] ?? 'neutral'}>
          {t(`roadmap.status.${task.status}`, task.status)}
        </Badge>
      </div>

      <p className="mt-1 text-sm text-muted">{t(`roadmap.why.${task.why_key}`, task.why_key)}</p>

      {task.depends_on.length > 0 ? (
        <p className="mt-2 text-xs text-muted">
          {t('roadmap.waitsOn', {
            tasks: task.depends_on.map((id) => t(`roadmap.task.${id}`, id)).join(', '),
          })}
        </p>
      ) : null}

      {task.needs_facts.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted">
          {task.needs_facts.map((fact) => (
            <li key={fact.key}>{fact.question}</li>
          ))}
        </ul>
      ) : null}

      {task.source_ids.length > 0 ? (
        <p className="mt-2 text-xs text-muted">
          {t('roadmap.reads', { sources: task.source_ids.join(', ') })}
        </p>
      ) : null}
    </li>
  );
}

export function Roadmap({ tasks, className }: { tasks: RoadmapTask[]; className?: string }) {
  const { t } = useTranslation('analyst');
  if (tasks.length === 0) return null;

  return (
    <section aria-labelledby="roadmap-heading" className={className}>
      <h2 id="roadmap-heading" className="text-xl">
        {t('roadmap.heading')}
      </h2>
      <p className="mt-2 max-w-measure text-sm text-muted">{t('roadmap.standfirst')}</p>

      <div className="mt-4 space-y-6">
        {WHEN_ORDER.map((when) => {
          const group = tasks.filter((task) => task.when === when);
          if (group.length === 0) return null;
          return (
            <div key={when}>
              <h3 className={cn('text-xs uppercase tracking-wide text-muted')}>
                {t(`roadmap.when.${when}`)}
              </h3>
              <ul className="mt-2 space-y-2">
                {group.map((task) => (
                  <Task key={task.task_id} task={task} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
