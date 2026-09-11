import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { buttonStyles } from '@/components/ui';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

/**
 * The whole navigation, on a phone.
 *
 * Full screen rather than a dropdown: six destinations at a comfortable touch
 * size do not fit in a panel, and a panel that scrolls hides half the product.
 * Focus is trapped while it is open, Escape closes it, and focus returns to the
 * button that opened it.
 */
interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const { t } = useTranslation('common');
  const panel = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useFocusTrap(panel, open, onClose);

  // Following a link should close the menu, or the reader lands on a new page
  // with the menu still covering it.
  useEffect(() => {
    if (open) onClose();
    // Only when the route changes — not when `open` or `onClose` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // A full-screen overlay that leaves the page scrollable behind it is
  // disorienting on a phone.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={t('menu.title')}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-bone lg:hidden"
    >
      <div className="flex items-center justify-between border-b border-rule px-5 py-4">
        <span className="font-display text-md">{t('brand.name')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('menu.close')}
          className="rounded-data p-1.5 text-muted hover:bg-surface-sunk hover:text-ink"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      {/*
        Deliberately not a <nav> landmark. The header already contributes one
        named "Main", and a second landmark with the same name is a duplicate a
        screen-reader user has to disambiguate — axe flags it as landmark-unique.
        The dialog is already named "Menu" and focus is trapped inside it, which
        is what a reader on a phone actually needs.
      */}
      <div className="flex-1 overflow-y-auto px-5 py-2">
        <ul className="m-0 list-none p-0">
          {NAV_ITEMS.map((item) => (
            <li key={item.to} className="border-b border-rule-faint last:border-b-0">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn('block py-4 text-md', isActive ? 'text-leaf' : 'text-ink hover:text-leaf')
                }
              >
                {t(`nav.${item.labelKey}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-rule px-5 py-3">
        <SignOutButton />
        <NavLink
          to="/assess"
          onClick={onClose}
          className={buttonStyles({ variant: 'secondary', className: 'shrink-0' })}
        >
          {t('cta.check')}
        </NavLink>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-rule px-5 py-4">
        <LanguageSelector />
        <NavLink
          to="/sahayak"
          onClick={onClose}
          className={buttonStyles({ className: 'shrink-0' })}
        >
          {t('cta.ask')}
        </NavLink>
      </div>
    </div>
  );
}
