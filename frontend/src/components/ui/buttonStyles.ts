import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

/**
 * Buttons carry weight by fill and border, never by shadow or lift. There is no
 * hover elevation anywhere in this system; hover changes colour, and that is all.
 *
 * `danger` uses --lac, which means the same thing everywhere in the product:
 * caution. It is not a "delete" style looking for a use.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-leaf text-bone border border-leaf hover:bg-ink hover:border-ink',
  secondary: 'bg-transparent text-leaf border border-rule-strong hover:bg-surface-sunk',
  quiet:
    'bg-transparent text-leaf border border-transparent underline decoration-transparent underline-offset-4 hover:decoration-current',
  danger: 'bg-transparent text-lac border border-lac hover:bg-lac hover:text-bone',
};

const SIZES = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-base',
} as const;

/**
 * The button's appearance, separable from the button element.
 *
 * A control that navigates must be an anchor — it needs middle-click, "open in
 * new tab", and the link role. Wrapping an anchor in a <button> to reuse the
 * styling produces invalid markup and a confused accessibility tree, so the
 * styling is exported instead.
 */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant | undefined;
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
} = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-medium',
    'transition-colors duration-quick ease-incise',
    'disabled:cursor-not-allowed disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
