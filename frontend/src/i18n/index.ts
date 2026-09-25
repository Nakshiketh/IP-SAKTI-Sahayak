import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import {
  DEFAULT_LOCALE,
  DEFAULT_NAMESPACE,
  findLocale,
  LOCALE_CODES,
  LOCALE_STORAGE_KEY,
  NAMESPACES,
} from './languages';
import { findMissingBundles, loadLocale, resources } from './resources';

/**
 * Language is detected, not asked for.
 *
 * Zero-config rule: a first-time reader configures nothing before their first
 * question, and that includes the language. The order below tries what the
 * reader chose last, then what their browser says, then English — and the
 * choice is always correctable from the header.
 *
 * Only English is in the first chunk. i18next starts with it, and the detected
 * language's files are fetched immediately after; `initI18n` resolves once that
 * has happened, so a reader in Tamil is not shown English and then corrected.
 * For an English reader nothing is fetched and the promise is already settled.
 */
export function initI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) return Promise.resolve(i18n);

  const missing = findMissingBundles();
  if (missing.length > 0) {
    // Loud in development, and never silent: a missing bundle renders raw keys.
    console.error(`Missing locale bundles: ${missing.join(', ')}`);
  }

  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      supportedLngs: LOCALE_CODES as unknown as string[],
      fallbackLng: DEFAULT_LOCALE,
      // Prevent i18next from splitting "zh-Hant" into "zh-Hant" + "zh" and
      // loading both. Each hyphenated code is its own locale.
      load: 'currentOnly',
      ns: NAMESPACES,
      defaultNS: DEFAULT_NAMESPACE,
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LOCALE_STORAGE_KEY,
        caches: ['localStorage'],
      },
      interpolation: {
        // React escapes for us; double-escaping mangles the punctuation this
        // product's copy relies on.
        escapeValue: false,
      },
      returnNull: false,
    });

  // Detection has run by now, so this is the language the reader will actually
  // see rather than a guess made before it.
/**
 * `language`, not `resolvedLanguage`.
 *
 * They differ in exactly the case that matters here. `language` is what
 * detection chose; `resolvedLanguage` is what i18next could actually resolve
 * after falling back. On a fresh load only English is bundled, so a reader
 * returning in Arabic has `language === 'ar'` and `resolvedLanguage === 'en'`
 * — and asking for the resolved one loaded the English bundles, found them
 * already present, and returned. The Arabic files were never fetched and the
 * reader's saved language was silently ignored on every reload.
 */
  const detected = findLocale(i18n.language ?? i18n.resolvedLanguage);
  return ensureLocale(detected.code).then(() => i18n);
}

/**
 * Put a locale's namespaces in place, if they are not already.
 *
 * Idempotent and safe to call on every switch: `hasResourceBundle` is what stops
 * a reader who toggles back and forth re-fetching what they already have.
 */
async function ensureLocale(code: (typeof LOCALE_CODES)[number]): Promise<void> {
  if (code === DEFAULT_LOCALE) return;
  if (NAMESPACES.every((namespace) => i18n.hasResourceBundle(code, namespace))) return;

  const bundles = await loadLocale(code);
  for (const [namespace, bundle] of Object.entries(bundles)) {
    i18n.addResourceBundle(code, namespace, bundle, true, true);
  }
}

/**
 * Change language and remember it. Also updates <html lang> and <html dir>.
 *
 * The switch happens after the files are in place, never before. Switching first
 * would show the reader a screen of raw dotted keys for as long as the fetch
 * took, which is a worse answer than a moment on the language they were already
 * reading.
 */
export function changeLanguage(code: string) {
  const locale = findLocale(code);
  void ensureLocale(locale.code).then(() => i18n.changeLanguage(locale.code));
  return locale;
}

export { i18n };
