/**
 * The languages this product answers in.
 *
 * `dir` is carried per locale even though all six are left-to-right today. The
 * cost is one field; the cost of discovering the assumption later, when a
 * right-to-left locale is added, is every layout at once.
 */
/**
 * The six codes, as a union rather than `string`.
 *
 * This is what lets `t(`languages.samples.${locale.code}`)` typecheck: with a
 * bare `string` the key is unknowable, and a locale added here without a
 * matching sample key would only be discovered by a reader seeing a raw key.
 */
export type LocaleCode = 'en' | 'hi' | 'te' | 'ta' | 'bn' | 'mr';

export interface LocaleDefinition {
  code: LocaleCode;
  /** The language's name in its own script — never transliterated. */
  nativeName: string;
  /** For places that must name the language in English, such as a test. */
  englishName: string;
  dir: 'ltr' | 'rtl';
}

export const LOCALES: readonly LocaleDefinition[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'hi', nativeName: 'हिंदी', englishName: 'Hindi', dir: 'ltr' },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', dir: 'ltr' },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', dir: 'ltr' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr' },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', dir: 'ltr' },
] as const;

export const LOCALE_CODES: readonly LocaleCode[] = LOCALES.map((locale) => locale.code);

export const DEFAULT_LOCALE: LocaleCode = 'en';

export const NAMESPACES = [
  'common',
  'home',
  'sahayak',
  'covered',
  'howitworks',
  'sources',
  'about',
  'privacy',
  'assessment',
  'analyst',
] as const;

export const DEFAULT_NAMESPACE = 'common';

/** Where the chosen language is remembered between visits. */
export const LOCALE_STORAGE_KEY = 'sahayak.language';

export function findLocale(code: string | undefined): LocaleDefinition {
  const exact = LOCALES.find((locale) => locale.code === code);
  if (exact) return exact;
  // "hi-IN" should resolve to "hi" rather than silently falling back to English.
  const base = code?.split('-')[0];
  return (
    LOCALES.find((locale) => locale.code === base) ??
    LOCALES.find((locale) => locale.code === DEFAULT_LOCALE)!
  );
}
