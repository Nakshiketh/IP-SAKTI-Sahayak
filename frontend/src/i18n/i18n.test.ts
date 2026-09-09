/**
 * Integrity of the locale set.
 *
 * These are cheap tests guarding an expensive failure: a missing key renders as
 * a raw dotted path on screen, and it renders that way only for readers in that
 * language — which is exactly the group least likely to be the one testing.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, findLocale, LOCALE_CODES, LOCALES, NAMESPACES } from '@/i18n/languages';
import { findMissingBundles } from '@/i18n/resources';

/**
 * Every locale file, read here rather than through `resources`.
 *
 * The app bundles English eagerly and fetches the other five on demand, so
 * `resources` deliberately holds only English. This test still has to compare
 * all six key sets, so it does its own eager glob — test-only code, which never
 * reaches the bundle the reader downloads.
 */
const files = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json', {
  eager: true,
});

const all: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, module] of Object.entries(files)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, locale, namespace] = match;
  if (!locale || !namespace) continue;
  all[locale] ??= {};
  all[locale][namespace] = module.default;
}

const UNTRANSLATED = '__untranslated';

function flatten(node: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === UNTRANSLATED) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      keys.push(...flatten(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('locales', () => {
  it('covers the six languages the product claims to answer in', () => {
    expect(LOCALE_CODES).toEqual(['en', 'hi', 'te', 'ta', 'bn', 'mr']);
  });

  it('names each language in its own script, never transliterated', () => {
    const native = Object.fromEntries(LOCALES.map((l) => [l.code, l.nativeName]));
    expect(native).toEqual({
      en: 'English',
      hi: 'हिंदी',
      te: 'తెలుగు',
      ta: 'தமிழ்',
      bn: 'বাংলা',
      mr: 'मराठी',
    });
  });

  it('bundles every namespace for every locale', () => {
    expect(findMissingBundles()).toEqual([]);
  });

  it.each(LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE))(
    '%s carries exactly the English key set',
    (locale) => {
      for (const namespace of NAMESPACES) {
        const english = all[DEFAULT_LOCALE]?.[namespace] as Record<string, unknown>;
        const target = all[locale]?.[namespace] as Record<string, unknown>;
        expect(flatten(target), `${locale}/${namespace}`).toEqual(flatten(english));
      }
    },
  );

  it('flags a seeded locale so English placeholders cannot pass for translation', () => {
    // Remove the flag when a namespace is genuinely translated, not before.
    const seeded = all.hi?.common as Record<string, unknown>;
    expect(seeded[UNTRANSLATED]).toBe(true);
    expect((all.en?.common as Record<string, unknown>)[UNTRANSLATED]).toBeUndefined();
  });
});

describe('findLocale', () => {
  it('resolves a regional tag to its base language', () => {
    expect(findLocale('hi-IN').code).toBe('hi');
    expect(findLocale('ta-LK').code).toBe('ta');
  });

  it('falls back to English rather than returning nothing', () => {
    expect(findLocale('pt-BR').code).toBe('en');
    expect(findLocale(undefined).code).toBe('en');
  });

  it('carries a direction per locale', () => {
    for (const locale of LOCALES) expect(locale.dir).toBe('ltr');
  });
});
