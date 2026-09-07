import { cn } from '@/lib/cn';

/**
 * The device that runs through the entire product.
 *
 * A solid indigo left rule means: this came from a retrieved passage, and you can
 * open it. A dashed neutral rule means: this is an example or a general
 * explanation, and nothing behind it is a source.
 *
 * A reader should learn this in one screen without being told, which only works
 * if it is never used for anything else.
 */
interface SourceRuleProps {
  sourced: boolean;
  children: React.ReactNode;
  /** Rendered above the content when unsourced, e.g. "Illustrative example". */
  note?: string;
  className?: string;
}

export function SourceRule({ sourced, children, note, className }: SourceRuleProps) {
  return (
    <div className={cn(sourced ? 'rule-sourced' : 'rule-illustrative', className)}>
      {!sourced && note ? <p className="mb-1 text-xs text-muted">{note}</p> : null}
      {children}
    </div>
  );
}
