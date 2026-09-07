import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import type { Confidence } from '@/types/domain';

/**
 * Confidence, with the reason attached.
 *
 * Four incised ticks, filled to the level. There is never a bare number and
 * never a percentage — a reader cannot act on "78%", and the system does not
 * know that figure to two significant figures anyway. What a reader can act on
 * is "based on four passages from two current sources", so the reason is
 * required, not optional.
 *
 * Colour is split deliberately between the ticks and the words. The ticks carry
 * the level — leaf, sap, neutral, lac — because they are a graphical object and
 * only need 3:1. The words stay in --ink, because --sap is 4.45:1 on --bone and
 * therefore not a text colour; this was caught by an axe pass in the browser, and
 * the rule it enforces is written down in src/styles/contrast.test.ts. The one
 * exception is `abstain`, whose label is lac (6.88:1, comfortably AA) because the
 * system declining to answer is exactly what lac is reserved for.
 *
 * `low` stays neutral rather than borrowing lac — spending lac on a merely-thin
 * answer would blunt it for the abstention that actually needs it.
 */
interface ConfidenceMeterProps {
  level: Confidence;
  /** One sentence, e.g. "Based on 4 passages from 2 current sources." Required. */
  reason: string;
  className?: string;
}

const TOTAL_TICKS = 4;

const LEVELS: Record<Confidence, { ticks: number; mark: string; word: string }> = {
  high: { ticks: 4, mark: 'text-leaf', word: 'text-ink' },
  moderate: { ticks: 3, mark: 'text-sap', word: 'text-ink' },
  low: { ticks: 2, mark: 'text-ink/60', word: 'text-ink' },
  abstain: { ticks: 0, mark: 'text-lac', word: 'text-lac' },
};

export function ConfidenceMeter({ level, reason, className }: ConfidenceMeterProps) {
  const { t } = useTranslation('common');
  const { ticks, mark, word } = LEVELS[level];
  const label = t(`confidence.${level}`);

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span className={cn('inline-flex items-center gap-1.5 text-base font-medium', word)}>
        <span
          className={cn('inline-flex items-end gap-[2px]', mark)}
          role="img"
          aria-label={t('confidence.meter', { label, filled: ticks, total: TOTAL_TICKS })}
        >
          {Array.from({ length: TOTAL_TICKS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'w-[3px] rounded-[1px]',
                i < ticks ? 'bg-current' : 'bg-current opacity-25',
              )}
              style={{ height: `${7 + i * 3}px` }}
            />
          ))}
        </span>
        {label}
      </span>
      <span className="text-xs text-muted">{reason}</span>
    </div>
  );
}
