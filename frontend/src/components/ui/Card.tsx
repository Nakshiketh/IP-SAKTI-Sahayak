import { cn } from '@/lib/cn';

/**
 * Three variants, structurally different — not one box in three colours.
 *
 *   data    a bounded surface for a record of something: hairline border, near-
 *           square corners, dense rows. Reads as a card in a drawer.
 *   ledger  not a box at all: an incised top rule and a label column, the way a
 *           register lays out an entry. For reference content.
 *   action  a filled, softer-cornered panel that exists to be acted on. Carries
 *           a control; the other two do not.
 *
 * If a fourth is ever needed, the question to answer first is what it *is* — not
 * what colour it should be.
 */
export type CardVariant = 'data' | 'ledger' | 'action';

interface CardProps {
  variant: CardVariant;
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
}

const VARIANTS: Record<CardVariant, string> = {
  data: 'rounded-data border border-rule bg-surface',
  ledger: 'border-t border-rule-strong pt-3',
  action: 'rounded-control bg-surface-sunk p-4',
};

export function Card({ variant, children, className, as: Tag = 'div' }: CardProps) {
  return <Tag className={cn(VARIANTS[variant], className)}>{children}</Tag>;
}

/** A row of a `data` card, separated from its neighbour by a hairline. */
export function CardRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-rule-faint px-3 py-2 last:border-b-0', className)}>
      {children}
    </div>
  );
}

/**
 * An entry in a `ledger` card: the label hangs in its own column, so a reader
 * scanning down the left edge reads the field names as a list.
 */
export function LedgerEntry({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 text-base">{children}</dd>
    </div>
  );
}
