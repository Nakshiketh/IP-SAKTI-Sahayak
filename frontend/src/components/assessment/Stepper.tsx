import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { STEPS } from '@/services/assessment';

type SealState = 'active' | 'passed' | 'upcoming';

function stateOf(index: number, current: number): SealState {
  if (index === current) return 'active';
  return index < current ? 'passed' : 'upcoming';
}

/**
 * Where the reader is in the assessment.
 *
 * The same seals as the route to a patent on the homepage: a numbered ring, a
 * leaf fill once passed, and one impression ring when a step becomes current.
 * The hairline between two seals fills as the reader moves past it. Steps
 * already reached are buttons, so the reader can go back to change an answer;
 * steps not reached are not, because they cannot be skipped to.
 */
export function Stepper({
  current,
  reached,
  onGo,
}: {
  current: number;
  reached: number;
  onGo: (index: number) => void;
}) {
  const { t } = useTranslation('assessment');
  const total = STEPS.length;

  return (
    <nav aria-label={t('stepper.label')}>
      <div className="md:hidden">
        <p className="max-w-none text-xs tabular-nums text-muted">
          {t('stepper.stepOf', { number: current + 1, total })}
        </p>
        <p key={current} className="route-swap max-w-none text-base font-medium text-ink">
          {t(`steps.${STEPS[current]!}`)}
        </p>
      </div>

      <ol className="m-0 mt-3 flex list-none items-start p-0 md:mt-0">
        {STEPS.map((step, index) => {
          const state = stateOf(index, current);
          const reachable = index <= reached && index !== current;
          const label = t(`steps.${step}`);
          const status =
            state === 'active'
              ? t('stepper.current')
              : index <= reached
                ? t('stepper.done')
                : t('stepper.upcoming');
          const last = index === total - 1;

          const seal = (
            <span
              data-state={state}
              className={cn(
                'relative grid h-8 w-8 shrink-0 place-items-center rounded-seal border text-xs font-medium tabular-nums',
                'transition-colors duration-panel ease-incise',
                state === 'active' && 'border-leaf bg-leaf text-bone',
                state === 'passed' && 'border-leaf bg-bone text-leaf',
                state === 'upcoming' && 'border-rule-strong bg-bone text-muted',
              )}
            >
              <span className="route-ripple" />
              {state === 'passed' ? <Check size={14} strokeWidth={2.5} aria-hidden="true" /> : index + 1}
            </span>
          );

          return (
            <li
              key={step}
              aria-current={state === 'active' ? 'step' : undefined}
              className={cn('min-w-0', last ? 'flex-none' : 'flex-1')}
            >
              <div className="flex items-center">
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onGo(index)}
                    className="rounded-seal"
                    aria-label={`${t('stepper.stepOf', { number: index + 1, total })}: ${label}, ${status}`}
                  >
                    {seal}
                  </button>
                ) : (
                  <span
                    role="img"
                    aria-label={`${t('stepper.stepOf', { number: index + 1, total })}: ${label}, ${status}`}
                  >
                    {seal}
                  </span>
                )}
                {!last ? (
                  <span aria-hidden="true" className="relative mx-2 h-px flex-1 overflow-hidden bg-rule">
                    <span
                      className="absolute inset-0 origin-left bg-leaf transition-transform duration-[520ms] ease-incise"
                      style={{ transform: `scaleX(${index < current ? 1 : 0})` }}
                    />
                  </span>
                ) : null}
              </div>
              <p
                aria-hidden="true"
                className={cn(
                  'mt-2 hidden max-w-none pr-3 text-xs leading-snug md:block',
                  state === 'active' ? 'font-medium text-ink' : 'text-muted',
                )}
              >
                {label}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
