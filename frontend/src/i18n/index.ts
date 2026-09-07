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
import { findMissingBundles, resources } from './resources';

/**
 * Language is detected, not asked for.
 *
 * Zero-config rule: a first-time reader configures nothing before their first
 * question, and that includes the language. The order below tries what the
 * reader chose last, then what their browser says, then English — and the
 * choice is always correctable from the header.
 */
export function initI18n() {
  if (i18n.isInitialized) return i18n;

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
      supportedLngs: LOCALE_CODES,
      fallbackLng: DEFAULT_LOCALE,
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

  return i18n;
}

/** Change language and remember it. Also updates <html lang> and <html dir>. */
export function changeLanguage(code: string) {
  const locale = findLocale(code);
  void i18n.changeLanguage(locale.code);
  return locale;
}

export { i18n };
