import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import type { DetailLevel } from '@/hooks/useDetailLevel';

/**
 * Simple or expert, as two radio buttons rather than a switch.
 *
 * A switch has an on state and an off state, and neither "simple" nor "expert"
 * is the absence of the other. Two labelled options also say what the choice is
 * before it is made, where a switch labelled "Expert" leaves a reader to work
 * out what the other position means.
 *
 * Radios rather than buttons because that is what this is: one of two, and a
 * keyboard reader gets arrow keys for free.
 */
export function DetailToggle({
  level,
  onChange,
  className,
}: {
  level: DetailLevel;
  onChange: (level: DetailLevel) => void;
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const options: DetailLevel[] = ['simple', 'expert'];

  return (
    <fieldset className={cn('flex flex-wrap items-center gap-2', className)}>
      <legend className="sr-only">{t('view.label')}</legend>
      <span aria-hidden="true" className="text-xs text-muted">
        {t('view.label')}
      </span>
      <div className="flex rounded-control border border-rule-strong p-0.5">
        {options.map((option) => (
          <label
            key={option}
            className={cn(
              // 44px minimum target: this sits beside body text and is one of
              // the few controls a reader uses on a phone with one thumb.
              'min-h-[44px] cursor-pointer rounded-control px-3 py-2 text-sm',
              'flex items-center has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
              'has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink',
              level === option ? 'bg-ink text-bone' : 'text-ink hover:bg-surface-sunk',
            )}
          >
            <input
              type="radio"
              name="detail-level"
              value={option}
              checked={level === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {t(`view.${option}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
