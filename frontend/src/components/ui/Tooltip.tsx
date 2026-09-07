import { useId, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * A short clarification, reachable by keyboard as well as pointer.
 *
 * Opens on hover *and* on focus, closes on Escape, and is wired with
 * aria-describedby rather than a title attribute — a title is unreachable on
 * touch and unreliable in screen readers.
 *
 * Nothing important lives only in a tooltip.
 */
interface TooltipProps {
  content: string;
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {/* The trigger keeps its own semantics; we only attach the description. */}
      <span aria-describedby={open ? id : undefined} className="contents">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cn(
          'absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[18rem]',
          'rounded-data border border-rule-strong bg-ink px-2 py-1 text-xs text-bone',
        )}
      >
        {content}
      </span>
    </span>
  );
}
