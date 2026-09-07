import { X } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Something a reader can act on: a filter, a follow-up question, an applied
 * facet. A Chip is a control. A Badge is a label. The difference is real, so
 * they do not look alike.
 *
 * The `demo` tone is dashed, because demo content must never be able to pass for
 * a verified source at a glance.
 */
export type ChipTone = 'neutral' | 'sourced' | 'demo';

interface ChipProps {
  children: React.ReactNode;
  tone?: ChipTone;
  onClick?: () => void;
  onRemove?: () => void;
  /** Accessible name for the remove control, e.g. "Remove filter: India". */
  removeLabel?: string;
  selected?: boolean;
  className?: string;
}

const TONES: Record<ChipTone, string> = {
  neutral: 'border-rule-strong text-ink hover:bg-surface-sunk',
  sourced: 'border-stamp/60 text-stamp hover:bg-stamp/[0.06]',
  demo: 'border-rule-strong border-dashed text-muted hover:bg-surface-sunk',
};

export function Chip({
  children,
  tone = 'neutral',
  onClick,
  onRemove,
  removeLabel,
  selected = false,
  className,
}: ChipProps) {
  const shared = cn(
    'inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs',
    'transition-colors duration-quick ease-incise',
    TONES[tone],
    selected && 'bg-surface-sunk',
    className,
  );

  if (onRemove) {
    return (
      <span className={shared}>
        {children}
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? 'Remove'}
          className="-mr-0.5 rounded-data p-0.5 hover:bg-ink/10"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </span>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} className={shared}>
        {children}
      </button>
    );
  }

  return <span className={shared}>{children}</span>;
}
