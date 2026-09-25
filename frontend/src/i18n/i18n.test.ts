/**
 * Integrity of the locale set.
 *
 * These are cheap tests guarding an expensive failure: a missing key renders as
 * a raw dotted path on screen, and it renders that way only for readers in that
 * language — which is exactly the group least likely to be the one testing.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  findLocale,
  INDIAN_LOCALES,
  INTERNATIONAL_LOCALES,
  LOCALE_CODES,
  LOCALES,
  NAMESPACES,
  scriptOf,
} from '@/i18n/languages';
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
  it('covers the fifteen languages the product claims to answer in', () => {
    expect(LOCALE_CODES).toEqual([
      // The Indian six come first, and that order is the point: this is an
      // Indian product, and the languages its readers work in are not an
      // afterthought below a list of export markets.
      'en', 'hi', 'te', 'ta', 'bn', 'mr',
      'ar', 'fr', 'es', 'de', 'pt', 'ru', 'zh', 'ja', 'ko',
    ]);
  });

  it('keeps the Indian languages first and distinguishable', () => {
    expect(INDIAN_LOCALES.map((l) => l.code)).toEqual(['en', 'hi', 'te', 'ta', 'bn', 'mr']);
    expect(INTERNATIONAL_LOCALES).toHaveLength(9);
    // Together they are everything: a locale that is in neither list would be
    // one the switcher groups nowhere and a reader never reaches.
    expect(INDIAN_LOCALES.length + INTERNATIONAL_LOCALES.length).toBe(LOCALES.length);
  });

  it('knows a script for every locale, so no reader gets a box instead of a word', () => {
    // A script with no font stack in tokens.css renders as tofu, and the reader
    // cannot tell a missing font from a broken product.
    for (const locale of LOCALES) expect(scriptOf(locale.code)).toBe(locale.script);
    expect(new Set(LOCALES.map((l) => l.script)).size).toBe(10);
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
      ar: 'العربية',
      fr: 'Français',
      es: 'Español',
      de: 'Deutsch',
      pt: 'Português',
      ru: 'Русский',
      zh: '中文',
      ja: '日本語',
      ko: '한국어',
    });
  });

  it('never writes a language name in Latin letters when it has its own script', () => {
    // "Hindi" in a switcher is useless to someone who reads only Devanagari.
    const latin = /^[A-Za-zÀ-ɏ\s'-]+$/;
    for (const locale of LOCALES) {
      if (locale.script === 'Latn') continue;
      expect(latin.test(locale.nativeName), `${locale.code} is transliterated`).toBe(false);
    }
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

  it('does not flag a genuinely translated namespace', () => {
    // A genuinely translated namespace does not carry the __untranslated placeholder flag.
    const translated = all.hi?.common as Record<string, unknown>;
    expect(translated[UNTRANSLATED]).toBeUndefined();
    expect((all.en?.common as Record<string, unknown>)[UNTRANSLATED]).toBeUndefined();
  });
});

describe('findLocale', () => {
  it('resolves a regional tag to its base language', () => {
    expect(findLocale('hi-IN').code).toBe('hi');
    expect(findLocale('ta-LK').code).toBe('ta');
  });

  it('falls back to English rather than returning nothing', () => {
    // 'pt-BR' used to be the unsupported tag here. Portuguese now exists, so it
    // resolves to 'pt' — which is the fallback working, not failing. Swahili
    // stands in for a language the product does not offer.
    expect(findLocale('sw-KE').code).toBe('en');
    expect(findLocale(undefined).code).toBe('en');
    expect(findLocale('pt-BR').code).toBe('pt');
    expect(findLocale('zh-Hans-CN').code).toBe('zh');
  });

  it('carries a direction per locale, and Arabic is the one that differs', () => {
    expect(findLocale('ar').dir).toBe('rtl');
    const rtl = LOCALES.filter((locale) => locale.dir === 'rtl').map((l) => l.code);
    expect(rtl).toEqual(['ar']);
    // Every Indian language is left-to-right, so adding Arabic must not have
    // flipped any of them by touching a shared default.
    for (const locale of INDIAN_LOCALES) expect(locale.dir).toBe('ltr');
  });
});
