import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * A full-bleed looping video behind a page.
 *
 * `object-cover` on a fixed, full-bleed element so the frame fills any viewport
 * without letterboxing. Where there is a poster it carries the first paint, so
 * there is a composed image on screen before a video byte arrives, and it is
 * also what remains if the source is missing or the codec is unsupported.
 *
 * Two variants.
 *
 * `signin` is the front door. The footage is dark, so it is lifted — brighter,
 * more saturated — and one gradient darkens only the top and bottom edges for
 * the wordmark and the audio control. The middle needs none: the card carries
 * its own tint, so the video can stay bright around it.
 *
 * `app` sits behind every page of the site. The footage is cream, close to the
 * page ground already, so it needs no lifting; a paper wash over it keeps ink
 * text reading the way it does on the plain page. With no poster, the first
 * paint is the page ground itself, which the footage then fades up out of.
 */
const VARIANTS = {
  signin: {
    src: '/assets/hero.mp4',
    poster: '/assets/hero-poster.jpg',
    ground: 'bg-[#0B120E]',
    filter: 'brightness-[1.15] saturate-[1.25] contrast-[1.05]',
    overlay: 'bg-gradient-to-b from-[#0B120E]/55 via-transparent to-[#0B120E]/60',
  },
  app: {
    src: '/assets/app-background.mp4',
    poster: undefined,
    ground: 'bg-bone',
    filter: '',
    overlay: 'bg-bone/40',
  },
} as const;

/**
 * Guarded, because `matchMedia` is not universal — jsdom has no implementation,
 * and an unguarded call throws during commit and takes the page down with it.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** `play()` returns a promise in current browsers and nothing in older ones. */
function tryPlay(video: HTMLVideoElement): void {
  void Promise.resolve(video.play()).catch(() => undefined);
}

export function HeroVideo({
  videoRef,
  muted,
  variant = 'signin',
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  muted: boolean;
  variant?: keyof typeof VARIANTS;
}) {
  const look = VARIANTS[variant];
  const [failed, setFailed] = useState(false);

  /**
   * Put the `muted` *attribute* on the element before anything tries to play.
   *
   * React applies `muted` as a DOM property, and the autoplay policy reads the
   * content attribute — so `<video muted autoPlay>` in JSX is muted to
   * JavaScript and unmuted to the policy, which blocks it. `defaultMuted` is
   * the property that writes the attribute. Remove this and the symptom is a
   * video frozen on its poster, with no error anywhere.
   */
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
  }, [videoRef]);

  /**
   * Start playing, and keep trying while the element is still loading.
   *
   * `play()` rejects if called before there is anything to play, so one call on
   * mount is a coin flip against the network.
   */
  const attemptPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || prefersReducedMotion()) return;
    tryPlay(video);
  }, [videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    attemptPlay();
    const events = ['loadeddata', 'canplay'] as const;
    events.forEach((event) => video.addEventListener(event, attemptPlay));
    return () => events.forEach((event) => video.removeEventListener(event, attemptPlay));
  }, [videoRef, attemptPlay]);

  /** A looping full-screen video is what reduced motion exists to stop. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (query.matches) video.pause();
      else tryPlay(video);
    };

    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [videoRef]);

  return (
    <div className={`fixed inset-0 -z-10 overflow-hidden print:hidden ${look.ground}`}>
      {failed ? (
        look.poster ? (
          <div
            className={`h-full w-full bg-cover bg-center ${look.filter}`}
            style={{ backgroundImage: `url(${look.poster})` }}
            role="img"
            aria-label=""
          />
        ) : null
      ) : (
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${look.filter}`}
          poster={look.poster}
          muted={muted}
          autoPlay
          loop
          playsInline
          preload="auto"
          // Decorative. The meaning of this page is in its content, and
          // describing moving footage on every loop is noise.
          aria-hidden="true"
          tabIndex={-1}
          onError={() => setFailed(true)}
        >
          <source src={look.src} type="video/mp4" />
        </video>
      )}

      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${look.overlay}`} />
    </div>
  );
}
