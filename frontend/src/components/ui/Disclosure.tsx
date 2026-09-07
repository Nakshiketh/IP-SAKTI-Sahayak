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
  /**
   * Controlled mode. Pass both to drive it from outside — the workspace opens
   * the examples from a keyboard shortcut, and a remount to force the state
   * would throw away focus.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: DisclosureProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const panelId = useId();

  function toggle() {
    const next = !open;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
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
