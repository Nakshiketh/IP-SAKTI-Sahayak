import meta from './locales.meta.json';

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

/**
 * How far each language has actually been translated, and what kind of
 * translation it is.
 *
 * Read from `locales.meta.json`, which `scripts/i18n/check_locales.py --write`
 * fills in from the locale files themselves. It cannot drift by being
 * forgotten, which matters: a coverage figure nobody maintains is worse than
 * none, because the switcher would keep asserting it.
 */
export interface LocaleStatus {
  /** 0 to 1. The share of English keys with a different value in this locale. */
  coverage: number;
  /** 1 is reviewed by the team; 2 is machine-drafted and labelled Beta. */
  tier: 1 | 2;
  reviewedBy: string | null;
}

export const LOCALE_STATUS: Readonly<Record<LocaleCode, LocaleStatus>> = Object.fromEntries(
  (meta.locales as { code: string; coverage: number; tier: 1 | 2; reviewed_by: string | null }[])
    .filter((entry): entry is typeof entry & { code: LocaleCode } =>
      LOCALES.some((locale) => locale.code === entry.code),
    )
    .map((entry) => [
      entry.code,
      { coverage: entry.coverage, tier: entry.tier, reviewedBy: entry.reviewed_by },
    ]),
) as Record<LocaleCode, LocaleStatus>;

/**
 * The coverage at which a language stops needing a warning beside it.
 *
 * Below this a reader will meet English constantly, and the switcher says so
 * rather than letting them discover it one screen at a time. The phase pack
 * hides such a language outright; that is not done here, because it would
 * remove every language but English from an Indian product before the
 * translation script has ever been given a key to run with. See PROGRESS.md.
 */
export const FULL_COVERAGE = meta.min_coverage_to_show as number;

export function isFullyTranslated(code: LocaleCode): boolean {
  return (LOCALE_STATUS[code]?.coverage ?? 0) >= FULL_COVERAGE;
}

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
