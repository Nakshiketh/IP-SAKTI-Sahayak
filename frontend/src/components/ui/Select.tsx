import { ChevronDown } from 'lucide-react';
import { useId, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * A native select, styled.
 *
 * Deliberately not a custom listbox. The platform control is keyboard-complete,
 * screen-reader-complete and works on a phone; a hand-rolled replacement would
 * have to earn its way past all three, and here it has no reason to.
 */
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  /** Hide the label visually but keep it for assistive technology. */
  hideLabel?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function Select({ label, hideLabel = false, options, className, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cn(
          'text-xs text-muted',
          hideLabel && 'absolute h-px w-px overflow-hidden [clip:rect(0,0,0,0)]',
        )}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className={cn(
            'w-full appearance-none rounded-control border border-rule-strong bg-surface',
            'py-1.5 pl-2.5 pr-8 text-base text-ink',
            'transition-colors duration-quick ease-incise hover:border-ink/60',
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    </div>
  );
}
