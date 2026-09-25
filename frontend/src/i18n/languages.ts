import meta from './locales.meta.json';

/**
 * The languages this product answers in: Indian and international.
 *
 * The Indian languages come first and are the reason the feature exists — a
 * vaidya in Nashik is the reader this product was built for. The international
 * languages were added because an Ayurvedic exporter's questions are answered by
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
  // Indian languages
  | 'en'
  | 'hi'
  | 'te'
  | 'ta'
  | 'bn'
  | 'mr'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'pa'
  | 'ur'
  // International languages
  | 'am'
  | 'ar'
  | 'bg'
  | 'bs'
  | 'ca'
  | 'cs'
  | 'da'
  | 'de'
  | 'el'
  | 'es'
  | 'es-419'
  | 'et'
  | 'fa'
  | 'fi'
  | 'fil'
  | 'fr'
  | 'fr-CA'
  | 'ga'
  | 'hr'
  | 'hu'
  | 'hy'
  | 'id'
  | 'is'
  | 'it'
  | 'ja'
  | 'jv'
  | 'ka'
  | 'kk'
  | 'ko'
  | 'lt'
  | 'lv'
  | 'mk'
  | 'mn'
  | 'ms'
  | 'mt'
  | 'my'
  | 'nb'
  | 'nl'
  | 'pl'
  | 'pt'
  | 'pt-BR'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'sl'
  | 'so'
  | 'sq'
  | 'sv'
  | 'sw'
  | 'th'
  | 'tr'
  | 'uk'
  | 'vi'
  | 'zh'
  | 'zh-Hant'
  | 'zh-HK';

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
  | 'Hant'
  | 'Jpan'
  | 'Kore'
  | 'Guru'
  | 'Gujr'
  | 'Knda'
  | 'Mlym'
  | 'Mymr'
  | 'Thai'
  | 'Geor'
  | 'Armn'
  | 'Ethi'
  | 'Mong';

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

/**
 * All locales, grouped: Indian first (alphabetically by English name),
 * then international (alphabetically by English name).
 */
export const LOCALES: readonly LocaleDefinition[] = [
  // ── Indian languages (alphabetical by English name) ──
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bangla', dir: 'ltr', script: 'Beng', indian: true },
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', script: 'Latn', indian: true },
  { code: 'gu', nativeName: 'ગુજરાતી', englishName: 'Gujarati', dir: 'ltr', script: 'Gujr', indian: true },
  { code: 'hi', nativeName: 'हिंदी', englishName: 'Hindi', dir: 'ltr', script: 'Deva', indian: true },
  { code: 'kn', nativeName: 'ಕನ್ನಡ', englishName: 'Kannada', dir: 'ltr', script: 'Knda', indian: true },
  { code: 'ml', nativeName: 'മലയാളം', englishName: 'Malayalam', dir: 'ltr', script: 'Mlym', indian: true },
  { code: 'mr', nativeName: 'मराठी', englishName: 'Marathi', dir: 'ltr', script: 'Deva', indian: true },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', englishName: 'Punjabi', dir: 'ltr', script: 'Guru', indian: true },
  { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', dir: 'ltr', script: 'Taml', indian: true },
  { code: 'te', nativeName: 'తెలుగు', englishName: 'Telugu', dir: 'ltr', script: 'Telu', indian: true },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', dir: 'rtl', script: 'Arab', indian: true },

  // ── International languages (alphabetical by English name) ──
  { code: 'sq', nativeName: 'Shqip', englishName: 'Albanian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'am', nativeName: 'አማርኛ', englishName: 'Amharic', dir: 'ltr', script: 'Ethi', indian: false },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', script: 'Arab', indian: false },
  { code: 'hy', nativeName: 'Հայերեն', englishName: 'Armenian', dir: 'ltr', script: 'Armn', indian: false },
  { code: 'bs', nativeName: 'bosanski', englishName: 'Bosnian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'bg', nativeName: 'български', englishName: 'Bulgarian', dir: 'ltr', script: 'Cyrl', indian: false },
  { code: 'my', nativeName: 'ဗမာ', englishName: 'Burmese', dir: 'ltr', script: 'Mymr', indian: false },
  { code: 'ca', nativeName: 'català', englishName: 'Catalan', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'hr', nativeName: 'hrvatski', englishName: 'Croatian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'cs', nativeName: 'čeština', englishName: 'Czech', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'da', nativeName: 'dansk', englishName: 'Danish', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'et', nativeName: 'eesti', englishName: 'Estonian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'fil', nativeName: 'Filipino', englishName: 'Filipino', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'fi', nativeName: 'suomi', englishName: 'Finnish', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'fr', nativeName: 'Français', englishName: 'French (France)', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'fr-CA', nativeName: 'Français (Canada)', englishName: 'French (Canada)', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'ka', nativeName: 'ქართული', englishName: 'Georgian', dir: 'ltr', script: 'Geor', indian: false },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'hu', nativeName: 'magyar', englishName: 'Hungarian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'is', nativeName: 'íslenska', englishName: 'Icelandic', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'id', nativeName: 'Indonesia', englishName: 'Indonesian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'ga', nativeName: 'Gaeilge', englishName: 'Irish', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'it', nativeName: 'italiano', englishName: 'Italian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr', script: 'Jpan', indian: false },
  { code: 'jv', nativeName: 'Jawa', englishName: 'Javanese', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'kk', nativeName: 'қазақ тілі', englishName: 'Kazakh', dir: 'ltr', script: 'Cyrl', indian: false },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', dir: 'ltr', script: 'Kore', indian: false },
  { code: 'lv', nativeName: 'latviešu', englishName: 'Latvian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'lt', nativeName: 'lietuvių', englishName: 'Lithuanian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'mk', nativeName: 'македонски', englishName: 'Macedonian', dir: 'ltr', script: 'Cyrl', indian: false },
  { code: 'ms', nativeName: 'Melayu', englishName: 'Malay', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'mt', nativeName: 'Malti', englishName: 'Maltese', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'mn', nativeName: 'Монгол', englishName: 'Mongolian', dir: 'ltr', script: 'Mong', indian: false },
  { code: 'nb', nativeName: 'norsk bokmål', englishName: 'Norwegian Bokmål', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'fa', nativeName: 'فارسی', englishName: 'Persian', dir: 'rtl', script: 'Arab', indian: false },
  { code: 'pl', nativeName: 'polski', englishName: 'Polish', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'pt', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'ro', nativeName: 'română', englishName: 'Romanian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', script: 'Cyrl', indian: false },
  { code: 'zh', nativeName: '简体中文', englishName: 'Simplified Chinese', dir: 'ltr', script: 'Hans', indian: false },
  { code: 'sk', nativeName: 'slovenčina', englishName: 'Slovak', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'sl', nativeName: 'slovenščina', englishName: 'Slovenian', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'so', nativeName: 'Soomaali', englishName: 'Somali', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'es', nativeName: 'Español (España)', englishName: 'Spanish (Spain)', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'es-419', nativeName: 'Español (Latinoamérica)', englishName: 'Spanish (Latin America)', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'sw', nativeName: 'Kiswahili', englishName: 'Swahili', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'sv', nativeName: 'svenska', englishName: 'Swedish', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai', dir: 'ltr', script: 'Thai', indian: false },
  { code: 'zh-Hant', nativeName: '繁體中文', englishName: 'Traditional Chinese', dir: 'ltr', script: 'Hant', indian: false },
  { code: 'zh-HK', nativeName: '繁體中文 (香港)', englishName: 'Traditional Chinese (Hong Kong)', dir: 'ltr', script: 'Hant', indian: false },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish', dir: 'ltr', script: 'Latn', indian: false },
  { code: 'uk', nativeName: 'українська', englishName: 'Ukrainian', dir: 'ltr', script: 'Cyrl', indian: false },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', dir: 'ltr', script: 'Latn', indian: false },
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
  if (!code) return LOCALES.find((locale) => locale.code === DEFAULT_LOCALE)!;

  const exact = LOCALES.find((locale) => locale.code === code);
  if (exact) return exact;

  // Progressive fallback: "zh-Hant-TW" → try "zh-Hant" → try "zh" → English.
  // This ensures "zh-Hant-TW" lands on "zh-Hant" (Traditional Chinese) rather
  // than "zh" (Simplified Chinese), and "pt-BR-SP" lands on "pt-BR" rather
  // than just "pt".
  const parts = code.split('-');
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('-');
    const found = LOCALES.find((locale) => locale.code === candidate);
    if (found) return found;
  }

  return LOCALES.find((locale) => locale.code === DEFAULT_LOCALE)!;
}

