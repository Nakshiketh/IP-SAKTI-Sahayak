import { useTranslation } from 'react-i18next';

import { AudioControl } from '@/components/auth/AudioControl';
import { HeroVideo } from '@/components/auth/HeroVideo';
import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { useHeroAudio } from '@/hooks/useHeroAudio';

/**
 * The member portal's frame: the front-door video and a centred sheet.
 *
 * The preview / brand-aside pane has been removed. The login sheet now sits
 * centred over the full-width hero video.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('common');
  const audio = useHeroAudio();

  return (
    <>
      <HeroVideo videoRef={audio.videoRef} muted={audio.muted} />

      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
          focus:rounded-[6px] focus:bg-[#F6F7F3] focus:px-4 focus:py-2 focus:text-base
          focus:font-medium focus:text-[#1A2029]"
      >
        {t('skipToContent')}
      </a>

      {/* Narrow screens: the brand pane becomes a bar. */}
      <header
        className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3
          bg-[#1D4B36]/[0.94] px-5 lg:hidden"
      >
        <span className="whitespace-nowrap font-display text-[20px] leading-none text-white">
          {t('brand.name')}
        </span>
        <div className="flex items-center gap-1">
          <LanguageSelector tone="inverse" />
          <AudioControl {...audio} className="lg:hidden" />
        </div>
      </header>

      {/* Wide-screen top bar */}
      <div className="relative z-10 hidden justify-between px-10 pt-8 lg:flex">
        <span className="whitespace-nowrap font-display text-[24px] font-bold leading-none text-white">
          {t('brand.name')}
        </span>
        <LanguageSelector tone="inverse" />
      </div>

      {/* Centred login sheet */}
      <main
        id="portal-main"
        className="relative z-10 mx-auto flex w-full max-w-[480px] flex-col
          rounded-2xl bg-[#08130D]/[0.82] px-8 py-10 text-white
          shadow-2xl shadow-black/40
          my-8 lg:my-10"
      >
        {children}
      </main>

      <AudioControl {...audio} className="fixed bottom-4 right-4 z-10 max-lg:hidden" />
    </>
  );
}
