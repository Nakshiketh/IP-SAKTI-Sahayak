import { cn } from '@/lib/cn';

/**
 * A polite or assertive announcement region.
 *
 * Answers stream in politely, so a screen-reader user is not interrupted
 * mid-sentence. Retrieval status is assertive, and only on a state change —
 * announcing every tick would be unusable.
 */
interface LiveRegionProps {
  children?: React.ReactNode;
  urgency?: 'polite' | 'assertive';
  /** Keep it in the accessibility tree but out of the visual layout. */
  visuallyHidden?: boolean;
  className?: string;
}

export function LiveRegion({
  children,
  urgency = 'polite',
  visuallyHidden = false,
  className,
}: LiveRegionProps) {
  return (
    <div
      aria-live={urgency}
      aria-atomic="true"
      className={cn(
        visuallyHidden &&
          'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
