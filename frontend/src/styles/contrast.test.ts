/**
 * Contrast audit over the real token file.
 *
 * The build document asks for AA contrast on all six palette pairings, verified
 * with a tool. This is that tool, run as a test so the verification happens on
 * every commit rather than once by hand.
 *
 * One finding is encoded here rather than papered over: --sap on --bone is
 * 4.49:1, a hair under the 4.5:1 needed for body text. It clears the 3:1 bar for
 * user-interface components and large text comfortably. So sap is a colour for
 * interactive states, borders and success marks — never for a paragraph. The
 * test asserts that, so if someone later "fixes" it by using sap as body text,
 * this file is where the reason is written down.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AA_LARGE,
  AA_NON_TEXT,
  AA_TEXT,
  flatten,
  parseAlphaTokens,
  parsePaletteTokens,
  hueSeparation,
  ratio,
  type Rgb,
} from '@/lib/contrast';

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf-8');
const palette = parsePaletteTokens(css);
const alphas = parseAlphaTokens(css);

function token(name: string): Rgb {
  const value = palette[name];
  if (!value) throw new Error(`--${name}-rgb is not declared in tokens.css`);
  return value;
}

describe('palette', () => {
  it('declares exactly the six tokens the design direction specifies', () => {
    expect(Object.keys(palette).sort()).toEqual(['bone', 'ink', 'lac', 'leaf', 'sap', 'stamp']);
  });

  it('holds the specified values', () => {
    expect(token('ink')).toEqual([16, 26, 20]);
    expect(token('leaf')).toEqual([29, 75, 54]);
    expect(token('sap')).toEqual([62, 125, 90]);
    expect(token('bone')).toEqual([246, 244, 238]);
    expect(token('lac')).toEqual([155, 44, 31]);
    expect(token('stamp')).toEqual([43, 76, 140]);
  });
});

describe('text on the page ground (--bone)', () => {
  const bone = () => token('bone');

  it.each([
    ['ink', AA_TEXT],
    ['leaf', AA_TEXT],
    ['lac', AA_TEXT],
    ['stamp', AA_TEXT],
  ])('--%s clears AA for body text', (name, threshold) => {
    expect(ratio(token(name), bone())).toBeGreaterThanOrEqual(threshold);
  });

  it('--sap does NOT clear AA for body text, and is therefore not a text colour', () => {
    const r = ratio(token('sap'), bone());
    expect(r).toBeLessThan(AA_TEXT);
    expect(r).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe('bone on the dark and saturated grounds', () => {
  it.each(['ink', 'leaf', 'lac', 'stamp'])('--bone on --%s clears AA for body text', (name) => {
    expect(ratio(token('bone'), token(name))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('--bone on --sap clears AA for large text and interface components only', () => {
    const r = ratio(token('bone'), token('sap'));
    expect(r).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('derived neutrals', () => {
  it('--text-muted still clears AA for body text once flattened onto --bone', () => {
    const muted = alphas['text-muted'];
    expect(muted, '--text-muted must be declared as an alpha of a palette token').toBeDefined();
    const flat = flatten(token(muted!.base), muted!.alpha, token('bone'));
    expect(ratio(flat, token('bone'))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('--rule-strong clears the 3:1 bar for a meaningful boundary', () => {
    const rule = alphas['rule-strong'];
    expect(rule).toBeDefined();
    const flat = flatten(token(rule!.base), rule!.alpha, token('bone'));
    expect(ratio(flat, token('bone'))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe('colour is never asked to carry a signal on its own', () => {
  it('the palette hues are separated, but not far enough to rely on', () => {
    // stamp/lac are 147 degrees apart, which reads clearly. stamp/leaf are only
    // 67 degrees apart — blue against green, the pairing a deuteranopic reader is
    // least able to separate. That is precisely why "sourced" is marked by the
    // left rule device and "IP versus regulatory" by the incised stroke pattern,
    // and why demo sources get a dashed border. Hue is a reinforcement here, never
    // the signal. The assertion is a floor, not a licence.
    expect(hueSeparation(token('stamp'), token('lac'))).toBeGreaterThanOrEqual(60);
    expect(hueSeparation(token('stamp'), token('leaf'))).toBeGreaterThanOrEqual(60);
    expect(hueSeparation(token('lac'), token('leaf'))).toBeGreaterThanOrEqual(60);
  });
});
