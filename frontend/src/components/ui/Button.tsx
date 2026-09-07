import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium',
        'transition-colors duration-quick ease-incise',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});
