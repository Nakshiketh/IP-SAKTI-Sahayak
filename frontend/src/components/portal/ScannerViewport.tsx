import { cn } from '@/lib/cn';
import type { ScannerPhase } from '@/hooks/useCardScanner';

/** The four corner brackets, in a 100 x 100 box. Geometry, not copy. */
const CORNERS = [
  'M1.5 20V6a4.5 4.5 0 0 1 4.5-4.5h14',
  'M80 1.5h14a4.5 4.5 0 0 1 4.5 4.5v14',
  'M98.5 80v14a4.5 4.5 0 0 1-4.5 4.5H80',
  'M20 98.5H6a4.5 4.5 0 0 1-4.5-4.5V80',
];

/**
 * The square the camera looks through.
 *
 * Deep leaf, not black, when there is no picture. Four haldi corner brackets,
 * and while the camera is looking, a 2 px haldi line sweeping top to bottom
 * every 2.4 s at 60% opacity. On a match the line stops and the corners turn
 * neem. Haldi appears nowhere else in the product.
 *
 * Everything here is decorative: the status line beside it says the same
 * things in words, so the colours never carry meaning alone.
 */
export function ScannerViewport({
  videoRef,
  phase,
  mirrored,
  children,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  phase: ScannerPhase;
  mirrored: boolean;
  children?: React.ReactNode;
}) {
  const live = phase === 'scanning' || phase === 'checking' || phase === 'detected';
  const sweeping = phase === 'scanning' || phase === 'starting';
  const detected = phase === 'detected';
  const resting = phase === 'idle' || phase === 'blocked';

  return (
    // Full width on a phone, as the brief asks; capped where the window is short,
    // so "Scan Member ID" stays on screen without scrolling.
    // Full width and square on a phone while the camera is on, as the brief
    // asks; a short band while it is off, so "Scan Member ID" is on the first
    // screen. Capped on wider screens so the main action stays in view.
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[12px] bg-[#0E2419]',
        // Centred when the cap makes it narrower than the card.
        'sm:mx-auto sm:aspect-square sm:min-w-[15rem] sm:max-w-[min(100%,calc(100svh-28rem))]',
        resting ? 'aspect-[16/7]' : 'aspect-square',
      )}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          live ? 'opacity-100' : 'opacity-0',
          mirrored && '-scale-x-100',
        )}
      />

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute',
          // In the short band the brackets keep their square, centred.
          resting
            ? 'inset-y-[14%] left-1/2 aspect-square -translate-x-1/2 sm:inset-[14%] sm:aspect-auto sm:translate-x-0'
            : 'inset-[14%]',
        )}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={cn(
            'absolute inset-0 h-full w-full transition-colors duration-150',
            detected ? 'text-[#2F6B45]' : 'text-[#C9971C]',
          )}
        >
          {CORNERS.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {sweeping ? (
          // The wrapper is the frame's full height, so translating it by 100%
          // carries the line from the top edge to the bottom one.
          <span className="portal-sweep absolute inset-0 block">
            <span className="absolute inset-x-[3%] top-0 block h-[2px] bg-[#C9971C] opacity-60" />
          </span>
        ) : null}
      </div>

      {children}
    </div>
  );
}
