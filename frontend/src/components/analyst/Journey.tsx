import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { STAGE_IDS, type StageId } from '@/services/analyst';

/**
 * The analysis journey, as a ledger of seals on one ruled line.
 *
 * Each seal is a stage the server reports as it finishes. The hairline between
 * two seals is incised in leaf once the stage it leads to is done, so the rail
 * fills in the order the work actually happened. A stage that did not need to
 * run again is drawn as an open seal and says so. One status line above the
 * rail carries the whole state for a screen reader: "Stage 3 of 7: Searching
 * prior art", never a bare number.
 */

export type StageState = 'idle' | 'active' | 'done' | 'reused';

export function Journey({
  stages,
  busy,
  complete,
}: {
  stages: Record<StageId, StageState>;
  busy: boolean;
  complete: boolean;
}) {
  const { t } = useTranslation('analyst');
  const activeIndex = STAGE_IDS.findIndex((id) => stages[id] === 'active');
  const finished = (id: StageId) =>
    stages[id] === 'done' || stages[id] === 'reused' || (!busy && complete);
  const active = activeIndex >= 0 ? STAGE_IDS[activeIndex] : undefined;
  const status =
    busy && active
      ? t('journey.status', {
          current: activeIndex + 1,
          total: STAGE_IDS.length,
          label: t(`journey.stages.${active}`),
        })
      : complete
        ? t('journey.complete', { total: STAGE_IDS.length })
        : '';

  return (
    <div className="mt-6 rounded-data border border-rule bg-bone px-4 pb-4 pt-3">
      <p role="status" aria-atomic="true" className="min-h-[1.25rem] text-xs text-muted">
        {status}
      </p>
      <ol aria-label={t('journey.label')} className="m-0 mt-3 grid list-none grid-cols-7 p-0">
        {STAGE_IDS.map((id, index) => {
          const state = stages[id];
          const done = finished(id);
          const reused = state === 'reused';
          return (
            <li
              key={id}
              data-stage={id}
              data-state={state}
              className="relative flex flex-col items-center text-center"
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[-50%] right-1/2 top-3.5 h-px bg-[var(--rule-strong)]"
                >
                  <span
                    className={cn(
                      'block h-full origin-left bg-leaf transition-transform duration-panel ease-incise',
                      done ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  'relative z-[1] grid h-7 w-7 place-items-center rounded-seal border text-xs tabular-nums transition-colors duration-panel ease-incise',
                  done && !reused && 'border-leaf bg-leaf text-bone',
                  reused && 'border-leaf bg-bone text-leaf',
                  state === 'active' && 'border-leaf bg-bone text-leaf',
                  !done && state !== 'active' && 'border-rule-strong bg-bone text-muted',
                )}
              >
                {state === 'active' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : done ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'mt-2 hidden px-1 text-xs leading-snug sm:block',
                  state === 'active' || done ? 'text-ink' : 'text-muted',
                )}
              >
                {t(`journey.stages.${id}`)}
                {reused ? <span className="block text-muted">{t('journey.reused')}</span> : null}
              </span>
              <span className="sr-only sm:hidden">
                {t(`journey.stages.${id}`)}
                {done ? `, ${reused ? t('journey.reused') : t('journey.done')}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
