import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { findLocale } from '@/i18n/languages';

/**
 * The frame every page sits in.
 *
 * `lang` and `dir` are written onto <html> from the active locale rather than
 * hardcoded in index.html: the per-script font stacks in tokens.css key off
 * `:lang()`, so a wrong `lang` attribute means a Telugu page rendered in the
 * Latin face, and a screen reader reading Telugu with English pronunciation.
 */
export function Shell() {
  const { t, i18n } = useTranslation('common');
  const locale = findLocale(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    document.documentElement.lang = locale.code;
    document.documentElement.dir = locale.dir;
  }, [locale.code, locale.dir]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="absolute left-4 top-4 z-[60] -translate-y-24 rounded-control border border-rule-strong bg-bone px-3 py-2 text-base focus:translate-y-0"
      >
        {t('skipToContent')}
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
