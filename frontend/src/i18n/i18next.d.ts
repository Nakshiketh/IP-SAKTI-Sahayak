/**
 * Types the translation keys from the English locale files.
 *
 * The point is not autocomplete, though that helps: it means a key removed from
 * a locale file, or a typo in a `t()` call, fails `tsc` instead of rendering the
 * raw key to a reader.
 */
import 'i18next';

import type about from '@/locales/en/about.json';
import type common from '@/locales/en/common.json';
import type covered from '@/locales/en/covered.json';
import type home from '@/locales/en/home.json';
import type howitworks from '@/locales/en/howitworks.json';
import type sahayak from '@/locales/en/sahayak.json';
import type sources from '@/locales/en/sources.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    returnNull: false;
    resources: {
      common: typeof common;
      home: typeof home;
      sahayak: typeof sahayak;
      covered: typeof covered;
      howitworks: typeof howitworks;
      sources: typeof sources;
      about: typeof about;
    };
  }
}
