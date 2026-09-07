/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Used by `src/styles/contrast.test.ts`, which reads the real token file rather
 * than a copy of the palette, so a colour cannot be changed without the check
 * running against the new value.
 */

export type Rgb = readonly [number, number, number];

/** WCAG AA: 4.5:1 for body text. */
export const AA_TEXT = 4.5;
/** WCAG AA: 3:1 for large text (>=24px, or >=18.66px bold). */
export const AA_LARGE = 3;
/** WCAG AA: 3:1 for user-interface components and graphical objects. */
export const AA_NON_TEXT = 3;

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite a translucent foreground over an opaque background. */
export function flatten(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  return [0, 1, 2].map((i) => {
    const fg = foreground[i] ?? 0;
    const bg = background[i] ?? 0;
    return Math.round(fg * alpha + bg * (1 - alpha));
  }) as unknown as Rgb;
}

/** Round to two decimals for readable assertion messages. */
export function ratio(a: Rgb, b: Rgb): number {
  return Math.round(contrastRatio(a, b) * 100) / 100;
}

/**
 * Pull `--name-rgb: R G B;` declarations out of a stylesheet.
 * Reading the token file directly is the point: the test cannot drift from it.
 */
export function parsePaletteTokens(css: string): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};
  const pattern = /--([a-z-]+)-rgb:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const [, name, r, g, b] = match;
    if (!name || !r || !g || !b) continue;
    out[name] = [Number(r), Number(g), Number(b)];
  }
  return out;
}

/** Pull `--name: rgb(var(--other-rgb) / 0.NN);` alpha derivations. */
export function parseAlphaTokens(css: string): Record<string, { base: string; alpha: number }> {
  const out: Record<string, { base: string; alpha: number }> = {};
  const pattern = /--([a-z-]+):\s*rgb\(var\(--([a-z-]+)-rgb\)\s*\/\s*([\d.]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    const [, name, base, alpha] = match;
    if (!name || !base || !alpha) continue;
    out[name] = { base, alpha: Number(alpha) };
  }
  return out;
}

/** Hue angle in degrees, 0-360. Red 0, green 120, blue 240. */
export function hue([r, g, b]: Rgb): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) return 0;
  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);
  return (h + 360) % 360;
}

/** Shortest angular distance between two hues, 0-180. */
export function hueSeparation(a: Rgb, b: Rgb): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.round(Math.min(d, 360 - d));
}
