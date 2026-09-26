import { useTranslation } from 'react-i18next';

import { AudioControl } from '@/components/auth/AudioControl';
import { HeroVideo } from '@/components/auth/HeroVideo';
import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { useHeroAudio } from '@/hooks/useHeroAudio';

/**
 * The member portal's frame: the front-door video, a brand pane, and a sheet.
 *
 * The video is `HeroVideo` exactly as the sign-in page always had it. Nothing
 * here changes it. Two tinted surfaces sit over it: the brand pane (leaf,
 * translucent) and the sheet the steps live on (near-black, translucent).
 * Tint only, no backdrop blur: a blur over a playing video is recomputed on
 * every frame, and on an ordinary laptop that cost showed as dropped frames. Both
 * run the full height of the window and sit flush against each other. There is
 * no floating card, no shadow, no radius. Past the sheet, on wide screens, the
 * footage is left untouched.
 *
 * Below 1024 px the brand pane folds into a 56 px bar carrying the wordmark,
 * and the sheet takes the full width.
 *
 * `docs/auth/DESIGN_PLAN.md` has the tokens, the wireframes and the reasons.
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

      <div className="relative flex min-h-[100svh] flex-col text-white lg:flex-row">
        {/* Narrow screens: the brand pane becomes a bar. */}
        <header
          className="flex h-14 shrink-0 items-center justify-between gap-3 bg-[#1D4B36]/[0.94]
            px-5 lg:hidden"
        >
          <span className="whitespace-nowrap font-display text-[20px] leading-none">
            {t('brand.name')}
          </span>
          <div className="flex items-center gap-1">
            <LanguageSelector tone="inverse" />
            {/* In the bar on narrow screens, where a fixed corner control
                would sit on top of the step's main button. */}
            <AudioControl {...audio} className="lg:hidden" />
          </div>
        </header>

        {/* Wide screens: the brand pane. */}
        <aside
          aria-label={t('brand.name')}
          className="relative hidden w-[38%] shrink-0 flex-col justify-between bg-[#1D4B36]/[0.86]
            px-12 py-12 lg:sticky lg:top-0 lg:flex lg:h-[100svh] xl:px-16"
        >
          <div>
            <p className="font-display text-[36px] font-bold leading-[1.1]">{t('brand.name')}</p>
            <p lang="hi" className="mt-2 font-display text-[20px] text-white/85">
              {t('auth.portal.wordmarkHindi')}
            </p>
            <p className="mt-10 max-w-[26rem] text-[16px] leading-[1.6] text-white/[0.86]">
              {t('auth.portal.brandLine')}
            </p>
          </div>
        </aside>

        {/* The sheet. */}
        <main
          id="portal-main"
          className="relative flex flex-1 flex-col bg-[#08130D]/[0.72]
            lg:max-w-[560px] lg:flex-none lg:basis-[560px] lg:border-r lg:border-white/[0.14]
            max-lg:w-full"
        >
          <div className="hidden justify-end px-10 pt-8 lg:flex">
            <LanguageSelector tone="inverse" />
          </div>
          <div
            className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-5 pb-10 pt-6
              sm:px-0 sm:pt-8 lg:mx-10 lg:w-auto lg:pt-14"
          >
            {children}
          </div>
        </main>
      </div>

      <AudioControl {...audio} className="fixed bottom-4 right-4 z-10 max-lg:hidden" />
    </>
  );
}
