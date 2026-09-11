import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';

import { AudioControl } from '@/components/auth/AudioControl';
import { HeroVideo } from '@/components/auth/HeroVideo';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { OfflineNotice } from '@/components/layout/OfflineNotice';
import { useHeroAudio } from '@/hooks/useHeroAudio';
import { findLocale } from '@/i18n/languages';

/**
 * The frame every page sits in.
 *
 * `lang` and `dir` are written onto <html> from the active locale rather than
 * hardcoded in index.html: the per-script font stacks in tokens.css key off
 * `:lang()`, so a wrong `lang` attribute means a Telugu page rendered in the
 * Latin face, and a screen reader reading Telugu with English pronunciation.
 *
 * The background video lives here rather than on each page, because this frame
 * stays mounted while the pages inside it change: moving between tabs never
 * restarts the footage or the sound. Its sound loops with it, starts on, and
 * answers to the control in the corner, which remembers its choice per tab.
 */
export function Shell() {
  const { t, i18n } = useTranslation('common');
  const locale = findLocale(i18n.resolvedLanguage ?? i18n.language);
  const backdrop = useHeroAudio({
    storageKey: 'sahayak.backdrop',
    soundByDefault: true,
    playsWithSound: Infinity,
  });

  useEffect(() => {
    document.documentElement.lang = locale.code;
    document.documentElement.dir = locale.dir;
  }, [locale.code, locale.dir]);

  return (
    <div className="flex min-h-screen flex-col">
      <HeroVideo variant="app" videoRef={backdrop.videoRef} muted={backdrop.muted} />
      <a
        href="#main"
        className="absolute left-4 top-4 z-[60] -translate-y-24 rounded-control border border-rule-strong bg-bone px-3 py-2 text-base focus:translate-y-0"
      >
        {t('skipToContent')}
      </a>
      <OfflineNotice />
      <Header />
      {/* Both boundaries sit here, inside the frame, so neither a route that
          throws nor a route still arriving as its own chunk takes the header and
          footer off screen with it. The reader keeps the navigation that gets
          them out of a broken page.

          The Suspense fallback holds the viewport height rather than collapsing:
          a page that shrinks and then grows again is a layout shift, and this
          one would land exactly where a reader is about to click. */}
      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      {/* Under the drawers, sheets and dialogs (z-40 and up), so none of them
          is ever covered by it. */}
      <AudioControl
        {...backdrop}
        className="fixed bottom-4 right-4 z-30 rounded-full bg-ink/60 backdrop-blur-sm print:hidden"
      />
    </div>
  );
}
