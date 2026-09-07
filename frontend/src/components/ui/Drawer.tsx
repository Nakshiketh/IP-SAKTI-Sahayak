import { X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

/**
 * A side panel that arrives from the edge it belongs to.
 *
 * On the workspace this holds sources at tablet width. It is a dialog: focus is
 * trapped while it is open, Escape closes it, and focus returns to whatever
 * opened it.
 */
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Defaults to the translated "Close". */
  closeLabel?: string;
  className?: string;
}

export function Drawer({ open, onClose, title, children, closeLabel, className }: DrawerProps) {
  const { t } = useTranslation('common');
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-ink/35"
        onClick={onClose}
        aria-hidden="true"
        data-testid="drawer-scrim"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex w-[min(22.5rem,100%)] flex-col',
          'border-l border-rule-strong bg-bone animate-slide-in-right',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <h2 className="text-md">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? t('actions.close')}
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
