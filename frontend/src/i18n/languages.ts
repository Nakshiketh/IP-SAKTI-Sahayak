import meta from './locales.meta.json';

/**
 * The languages this product answers in: six Indian, nine international.
 *
 * The Indian languages come first and are the reason the feature exists — a
 * vaidya in Nashik is the reader this product was built for. The international
 * nine were added because an Ayurvedic exporter's questions are answered by
 * WIPO, the EPO and foreign registries, and the people they deal with there do
 * not read Devanagari.
 *
 * `dir` was carried per locale from the start, when all six were
 * left-to-right, on the reasoning that the cost is one field and the cost of
 * discovering the assumption later is every layout at once. Arabic is that
 * later, and the bet paid: `Shell.tsx` already set `documentElement.dir` from
 * this field, so the whole interface mirrored without a layout change.
 *
 * `script` is new and earns its place differently. A page that renders Chinese
 * in a font with no CJK coverage shows boxes, and the reader cannot tell a
 * missing font from a broken product. See `scriptOf` and fonts.css.
 */
/**
 * The codes, as a union rather than `string`.
 *
 * This is what lets `t(`languages.samples.${locale.code}`)` typecheck: with a
 * bare `string` the key is unknowable, and a locale added here without a
 * matching sample key would only be discovered by a reader seeing a raw key.
 */
export type LocaleCode =
  | 'en'
  | 'hi'
  | 'te'
  | 'ta'
  | 'bn'
  | 'mr'
  | 'ar'
  | 'fr'
  | 'es'
  | 'de'
  | 'pt'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'ko';

/** ISO 15924, and only the ones present. Drives font loading, nothing else. */
export type ScriptCode =
  | 'Latn'
  | 'Deva'
  | 'Telu'
  | 'Taml'
  | 'Beng'
  | 'Arab'
  | 'Cyrl'
  | 'Hans'
  | 'Jpan'
  | 'Kore';

export interface LocaleDefinition {
  code: LocaleCode;
  /** The language's name in its own script — never transliterated. */
  nativeName: string;
  /** For places that must name the language in English, such as a test. */
  englishName: string;
  dir: 'ltr' | 'rtl';
  script: ScriptCode;
  /** India's official languages, which this product is first of all for. */
  indian: boolean;
}

export const LOCALES: readonly LocaleDefinition[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', script: 'Latn', indian: true }, // prettier-ignore
  { code: 'hi', nativeName: 'हिंदी', englishName: 'Hindi', dir: 'ltr', script: 'Deva', indian: true },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', dir: 'ltr', script: 'Telu', indian: true }, // prettier-ignore
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', dir: 'ltr', script: 'Taml', indian: true },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr', script: 'Beng', indian: true }, // prettier-ignore
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', dir: 'ltr', script: 'Deva', indian: true },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', script: 'Arab', indian: false }, // prettier-ignore
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', script: 'Latn', indian: false }, // prettier-ignore
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', script: 'Latn', indian: false }, // prettier-ignore
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', script: 'Latn', indian: false }, // prettier-ignore
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', script: 'Latn', indian: false }, // prettier-ignore
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', script: 'Cyrl', indian: false }, // prettier-ignore
  { code: 'zh', nativeName: '中文', englishName: 'Chinese', dir: 'ltr', script: 'Hans', indian: false },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr', script: 'Jpan', indian: false }, // prettier-ignore
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', dir: 'ltr', script: 'Kore', indian: false },
] as const;

/** The scripts in use, for a caller that needs to load a font per script. */
export function scriptOf(code: LocaleCode): ScriptCode {
  return LOCALES.find((locale) => locale.code === code)?.script ?? 'Latn';
}

export const INDIAN_LOCALES: readonly LocaleDefinition[] = LOCALES.filter(
  (locale) => locale.indian,
);

export const INTERNATIONAL_LOCALES: readonly LocaleDefinition[] = LOCALES.filter(
  (locale) => !locale.indian,
);

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
