import { cn } from '@/lib/cn';

/**
 * A static metadata label: a jurisdiction, a document type, an as-of date.
 *
 * Not interactive, never removable. If a reader can act on it, it is a Chip.
 * Sentence case — no all-caps letter-spaced eyebrows anywhere in this system.
 */
export type BadgeTone = 'neutral' | 'sourced' | 'caution';

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'text-muted bg-surface-sunk',
  sourced: 'text-stamp bg-stamp/[0.08]',
  caution: 'text-lac bg-lac/[0.08]',
};

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-data px-1.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
