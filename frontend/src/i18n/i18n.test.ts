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
 * all key sets, so it does its own eager glob — test-only code, which never
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
  it('covers all languages the product claims to answer in', () => {
    // Indian languages come first (alphabetical by English name),
    // then international languages (alphabetical by English name).
    expect(LOCALE_CODES).toEqual([
      // Indian (alphabetical)
      'bn', 'en', 'gu', 'hi', 'kn', 'ml', 'mr', 'pa', 'ta', 'te', 'ur',
      // International (alphabetical)
      'sq', 'am', 'ar', 'hy', 'bs', 'bg', 'my', 'ca', 'hr', 'cs',
      'da', 'nl', 'et', 'fil', 'fi', 'fr', 'fr-CA', 'ka', 'de', 'el',
      'hu', 'is', 'id', 'ga', 'it', 'ja', 'jv', 'kk', 'ko', 'lv',
      'lt', 'mk', 'ms', 'mt', 'mn', 'nb', 'fa', 'pl', 'pt', 'pt-BR',
      'ro', 'ru', 'zh', 'sk', 'sl', 'so', 'es', 'es-419', 'sw', 'sv',
      'th', 'zh-Hant', 'zh-HK', 'tr', 'uk', 'vi',
    ]);
  });

  it('keeps the Indian languages first and distinguishable', () => {
    expect(INDIAN_LOCALES.map((l) => l.code)).toEqual([
      'bn', 'en', 'gu', 'hi', 'kn', 'ml', 'mr', 'pa', 'ta', 'te', 'ur',
    ]);
    expect(INTERNATIONAL_LOCALES.length).toBe(56);
    // Together they are everything: a locale that is in neither list would be
    // one the switcher groups nowhere and a reader never reaches.
    expect(INDIAN_LOCALES.length + INTERNATIONAL_LOCALES.length).toBe(LOCALES.length);
  });

  it('knows a script for every locale, so no reader gets a box instead of a word', () => {
    // A script with no font stack in tokens.css renders as tofu, and the reader
    // cannot tell a missing font from a broken product.
    for (const locale of LOCALES) expect(scriptOf(locale.code)).toBe(locale.script);
    expect(new Set(LOCALES.map((l) => l.script)).size).toBe(21);
  });

  it('names each language in its own script, never transliterated', () => {
    const native = Object.fromEntries(LOCALES.map((l) => [l.code, l.nativeName]));
    // Spot-check some key ones
    expect(native.en).toBe('English');
    expect(native.hi).toBe('हिंदी');
    expect(native.te).toBe('తెలుగు');
    expect(native.ta).toBe('தமிழ்');
    expect(native.bn).toBe('বাংলা');
    expect(native.mr).toBe('मराठी');
    expect(native.ar).toBe('العربية');
    expect(native.fr).toBe('Français');
    expect(native.ja).toBe('日本語');
    expect(native.ko).toBe('한국어');
    expect(native.gu).toBe('ગુજરાતી');
    expect(native.kn).toBe('ಕನ್ನಡ');
    expect(native.ml).toBe('മലയാളം');
    expect(native.pa).toBe('ਪੰਜਾਬੀ');
    expect(native.ur).toBe('اردو');
    expect(native.zh).toBe('简体中文');
    expect(native['zh-Hant']).toBe('繁體中文');
    expect(native.ru).toBe('Русский');
    expect(native.de).toBe('Deutsch');
    expect(native.th).toBe('ไทย');
  });

  it('never writes a language name in Latin letters when it has its own script', () => {
    // "Hindi" in a switcher is useless to someone who reads only Devanagari.
    const latin = /^[A-Za-zÀ-ɏ\s'()-]+$/;
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
    // Swahili ('sw') is now a supported language. Use something truly unsupported.
    expect(findLocale('xh-ZA').code).toBe('en');
    expect(findLocale(undefined).code).toBe('en');
  });

  it('resolves regional Chinese tags correctly', () => {
    expect(findLocale('zh-Hans-CN').code).toBe('zh');
    expect(findLocale('zh-Hant').code).toBe('zh-Hant');
    expect(findLocale('zh-HK').code).toBe('zh-HK');
  });

  it('resolves regional variants with exact match first', () => {
    expect(findLocale('pt-BR').code).toBe('pt-BR');
    expect(findLocale('fr-CA').code).toBe('fr-CA');
    expect(findLocale('es-419').code).toBe('es-419');
  });

  it('carries a direction per locale, and RTL languages are marked correctly', () => {
    expect(findLocale('ar').dir).toBe('rtl');
    expect(findLocale('fa').dir).toBe('rtl');
    expect(findLocale('ur').dir).toBe('rtl');
    const rtl = LOCALES.filter((locale) => locale.dir === 'rtl').map((l) => l.code);
    expect(rtl).toEqual(expect.arrayContaining(['ar', 'fa', 'ur']));
    // Every Indian language except Urdu is left-to-right.
    for (const locale of INDIAN_LOCALES) {
      if (locale.code === 'ur') continue;
      expect(locale.dir).toBe('ltr');
    }
  });
});
