import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

/**
 * A palm-leaf manuscript page whose incised writing lines resolve into a graph
 * of linked sources.
 *
 * The one place in this product where boldness is spent. Everything else stays
 * quiet, because two competing focal points means neither works.
 *
 * The idea is literal rather than decorative: on the left the leaf is ruled and
 * written, the way a text is; travelling right, the ruled lines lift off the
 * baseline, branch, and terminate in seals. That is what retrieval does to a
 * document — it turns continuous text into addressable, linked passages. The
 * seals are indigo because indigo means sourced everywhere else in the product.
 *
 * Motion: one orchestrated draw-on at page load, then static. The strokes are
 * dashed to their own length and the offset animates to zero, so the lines
 * appear to be incised rather than faded in. Under prefers-reduced-motion the
 * global rule in tokens.css collapses every duration, and because each animation
 * ends at the final state with fill-mode both, the composition simply arrives
 * complete.
 */

/** Ruled writing lines on the left of the leaf. */
const RULES: ReadonlyArray<{ y: number; x2: number }> = [
  { y: 74, x2: 214 },
  { y: 90, x2: 238 },
  { y: 106, x2: 200 },
  { y: 122, x2: 246 },
  { y: 138, x2: 209 },
  { y: 154, x2: 182 },
];

/** Lines that leave the baseline and become edges of the graph. */
const EDGES: ReadonlyArray<{ d: string; delay: number }> = [
  { d: 'M238 90 C 286 90, 296 76, 336 74', delay: 520 },
  { d: 'M246 122 C 292 122, 300 114, 336 112', delay: 640 },
  { d: 'M246 122 C 296 122, 312 146, 352 152', delay: 760 },
  { d: 'M209 138 C 268 138, 286 166, 320 172', delay: 880 },
  { d: 'M336 74 C 380 74, 392 92, 414 112', delay: 1000 },
  { d: 'M336 112 C 374 112, 392 124, 414 112', delay: 1080 },
  { d: 'M352 152 C 384 152, 402 130, 414 112', delay: 1160 },
  { d: 'M320 172 C 358 172, 374 158, 392 150', delay: 1240 },
  { d: 'M352 152 C 372 152, 384 150, 392 150', delay: 1320 },
];

/** Seals: the passages the edges terminate in. */
const NODES: ReadonlyArray<{ cx: number; cy: number; r: number; delay: number }> = [
  { cx: 336, cy: 74, r: 4.5, delay: 900 },
  { cx: 336, cy: 112, r: 4, delay: 980 },
  { cx: 352, cy: 152, r: 4.5, delay: 1060 },
  { cx: 320, cy: 172, r: 3.5, delay: 1140 },
  { cx: 414, cy: 112, r: 6.5, delay: 1400 },
  { cx: 392, cy: 150, r: 4.5, delay: 1480 },
];

export function ManuscriptGraph({ className }: { className?: string }) {
  const { t } = useTranslation('home');

  return (
    <svg
      viewBox="0 0 480 230"
      role="img"
      aria-label={t('hero.visualAlt')}
      className={cn('h-auto w-full', className)}
      fill="none"
    >
      {/* The leaf: a long, shallow, bowed strip. Not a rounded rectangle. */}
      <path
        d="M14 58 C 132 40, 348 40, 466 58 C 472 59, 472 171, 466 172
           C 348 190, 132 190, 14 172 C 8 171, 8 59, 14 58 Z"
        className="incise-stroke animate-[incise_900ms_var(--ease-incise)_both] fill-ink/[0.035] stroke-ink/25"
        strokeWidth="1"
        style={{ '--len': 1400 } as React.CSSProperties}
      />

      {/* The binding hole a cord would pass through. */}
      <circle cx="62" cy="115" r="5.5" className="stroke-ink/30" strokeWidth="1" />

      {/* Writing: ruled lines, incised left to right. */}
      {RULES.map((rule, index) => (
        <line
          key={rule.y}
          x1="92"
          y1={rule.y}
          x2={rule.x2}
          y2={rule.y}
          strokeWidth="1.5"
          strokeLinecap="round"
          className="incise-stroke animate-[incise_600ms_var(--ease-incise)_both] stroke-ink/45"
          style={
            {
              '--len': rule.x2 - 92,
              animationDelay: `${180 + index * 70}ms`,
            } as React.CSSProperties
          }
        />
      ))}

      {/* The text lifting into a graph. */}
      {EDGES.map((edge) => (
        <path
          key={edge.d}
          d={edge.d}
          strokeWidth="1.25"
          strokeLinecap="round"
          className="incise-stroke animate-[incise_700ms_var(--ease-incise)_both] stroke-stamp/55"
          style={{ '--len': 260, animationDelay: `${edge.delay}ms` } as React.CSSProperties}
        />
      ))}

      {/* Seals. */}
      {NODES.map((node) => (
        <g key={`${node.cx}-${node.cy}`}>
          <circle
            cx={node.cx}
            cy={node.cy}
            r={node.r}
            className="seal-mark animate-[seal_320ms_var(--ease-incise)_both] fill-stamp"
            style={{ animationDelay: `${node.delay}ms` }}
          />
          <circle
            cx={node.cx}
            cy={node.cy}
            r={node.r + 4}
            strokeWidth="1"
            className="seal-mark animate-[seal_320ms_var(--ease-incise)_both] stroke-stamp/30"
            style={{ animationDelay: `${node.delay + 80}ms` }}
          />
        </g>
      ))}
    </svg>
  );
}
