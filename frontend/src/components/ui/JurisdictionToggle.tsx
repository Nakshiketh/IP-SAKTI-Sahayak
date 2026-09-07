import { cn } from '@/lib/cn';
import type { Jurisdiction } from '@/types/domain';

/**
 * The most prominent control on the workspace, by design.
 *
 * Changing it re-runs retrieval and swaps the answer set outright. It never
 * blends the two — India and International are separate indexes and separate
 * answer surfaces, and the control has to look like a switch between two places,
 * not a filter that widens a result set.
 *
 * Implemented as a radiogroup: arrow keys move between the two, and only the
 * selected one is in the tab order.
 */
interface JurisdictionToggleProps {
  value: Jurisdiction;
  onChange: (value: Jurisdiction) => void;
  labels: { IN: string; INTL: string };
  className?: string;
  'aria-label': string;
}

const ORDER: readonly Jurisdiction[] = ['IN', 'INTL'];

export function JurisdictionToggle({
  value,
  onChange,
  labels,
  className,
  ...aria
}: JurisdictionToggleProps) {
  function onKeyDown(event: React.KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const index = ORDER.indexOf(value);
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const next = ORDER[(index + (forward ? 1 : ORDER.length - 1)) % ORDER.length];
    if (next) onChange(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={aria['aria-label']}
      onKeyDown={onKeyDown}
      className={cn('inline-flex rounded-control border border-ink p-0.5', className)}
    >
      {ORDER.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-[4px] px-4 py-1.5 text-base font-medium',
              'transition-colors duration-quick ease-incise',
              selected ? 'bg-ink text-bone' : 'bg-transparent text-ink hover:bg-surface-sunk',
            )}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
