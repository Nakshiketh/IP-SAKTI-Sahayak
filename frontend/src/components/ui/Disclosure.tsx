import { ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Depth on request. The summary line is always enough on its own; opening it
 * reveals the working, not the point.
 *
 * The chevron rotates because the reader asked it to — that is motion answering
 * an action, which is the only kind this system has.
 */
interface DisclosureProps {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Disclosure({ summary, children, defaultOpen = false, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-data py-1 text-left text-base hover:text-leaf"
      >
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-transform duration-quick ease-incise',
            open && 'rotate-90',
          )}
        />
        {summary}
      </button>
      <div id={panelId} hidden={!open} className="border-l border-rule pl-5 pt-1">
        {children}
      </div>
    </div>
  );
}
