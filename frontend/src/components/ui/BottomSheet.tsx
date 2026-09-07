import { X } from 'lucide-react';
import { useRef } from 'react';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

/**
 * The phone equivalent of the drawer.
 *
 * At 360px there is no room for a side panel, so sources arrive from the bottom
 * with a count on the control that opens them. Same dialog semantics as Drawer:
 * focus trapped, Escape closes, focus restored.
 */
interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  closeLabel?: string;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  closeLabel = 'Close',
  className,
}: BottomSheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-ink/35"
        onClick={onClose}
        aria-hidden="true"
        data-testid="sheet-scrim"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col',
          'rounded-t-control border-t border-rule-strong bg-bone animate-slide-up',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <h2 className="text-md">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-data p-1 text-muted hover:bg-surface-sunk hover:text-ink"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
