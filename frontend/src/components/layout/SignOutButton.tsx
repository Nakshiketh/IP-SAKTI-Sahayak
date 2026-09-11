import { LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/authContext';
import { cn } from '@/lib/cn';

/**
 * Who is signed in, and the way out.
 *
 * No avatar menu. There is exactly one account action in this product, and
 * hiding it behind a click to save a few pixels would be a menu built for the
 * sake of having one.
 *
 * The username appears only from `xl` up. Below that the header is already
 * carrying six destinations, a language selector and the primary call to
 * action, and the name was rendering as "de…" — a truncation that tells the
 * reader nothing and costs the space of telling them something. The full name
 * is always in the mobile menu, where there is room for it.
 */
export function SignOutButton({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <div className={cn('items-center gap-2.5', className ?? 'flex')}>
      <span className="hidden max-w-[12rem] truncate text-xs text-muted xl:inline">
        <span className="sr-only">{t('auth.signedInAs')}: </span>
        {user.username}
      </span>
      <button
        type="button"
        onClick={signOut}
        // `whitespace-nowrap`: without it the label wraps to two lines the
        // moment the header tightens, which is what pushed it out of shape.
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-data
          border border-rule px-2.5 py-1 text-xs text-ink
          transition-colors duration-quick ease-incise hover:bg-surface-sunk"
      >
        <LogOut size={14} aria-hidden="true" />
        {t('auth.signOut')}
      </button>
    </div>
  );
}
