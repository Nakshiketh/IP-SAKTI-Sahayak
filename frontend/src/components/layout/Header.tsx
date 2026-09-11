import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router-dom';

import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { SignOutButton } from '@/components/layout/SignOutButton';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { NAV_ITEMS } from '@/components/layout/navigation';
import { buttonStyles } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Six destinations, no dropdowns, no second level.
 *
 * The wordmark carries a descriptor beneath it because "IP-SAKTI Sahayak" tells
 * a first-time reader nothing on its own, and the header is the only place that
 * costs nothing to say what this is.
 */
export function Header() {
  const { t } = useTranslation('common');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-[75rem] items-center gap-6 px-5 py-4">
        <Link to="/" className="rounded-data leading-tight">
          <span className="block font-display text-md text-ink">{t('brand.name')}</span>
          <span className="block text-xs text-muted">{t('brand.descriptor')}</span>
        </Link>

        <nav aria-label={t('nav.label')} className="ml-auto hidden lg:block">
          <ul className="m-0 flex list-none items-center gap-5 p-0">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'rounded-data pb-0.5 text-base transition-colors duration-quick ease-incise',
                      isActive
                        ? 'border-b-2 border-leaf text-ink'
                        : 'border-b-2 border-transparent text-muted hover:text-ink',
                    )
                  }
                >
                  {t(`nav.${item.labelKey}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <SignOutButton className="hidden lg:flex" />
          <LanguageSelector className="hidden sm:inline-flex" />
          <NavLink
            to="/sahayak"
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'hidden lg:inline-flex' })}
          >
            {t('cta.ask')}
          </NavLink>
          <NavLink
            to="/assess"
            className={buttonStyles({ size: 'sm', className: 'hidden lg:inline-flex' })}
          >
            {t('cta.check')}
          </NavLink>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('menu.open')}
            aria-expanded={menuOpen}
            className="rounded-data p-1.5 text-ink hover:bg-surface-sunk lg:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
