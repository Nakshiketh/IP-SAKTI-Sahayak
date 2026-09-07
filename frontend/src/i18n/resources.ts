import { LOCALE_CODES, NAMESPACES } from './languages';

/**
 * Locale files, collected at build time.
 *
 * Every namespace for every locale is bundled. Six languages of short interface
 * copy is a few kilobytes, and lazy-loading them would mean a reader who
 * switches language watches the interface arrive in pieces. That trade changes
 * if answer content ever moves into these files; it should not.
 */
const modules = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json', {
  eager: true,
});

type Bundle = Record<string, Record<string, Record<string, unknown>>>;

function build(): Bundle {
  const bundle: Bundle = {};
  for (const [path, module] of Object.entries(modules)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, locale, namespace] = match;
    if (!locale || !namespace) continue;
    bundle[locale] ??= {};
    bundle[locale][namespace] = module.default;
  }
  return bundle;
}

export const resources = build();

/**
 * Fail the build rather than ship a locale with a missing namespace: a missing
 * file shows up as a raw key on screen, which is worse than English text.
 */
export function findMissingBundles(): string[] {
  const missing: string[] = [];
  for (const locale of LOCALE_CODES) {
    for (const namespace of NAMESPACES) {
      if (!resources[locale]?.[namespace]) missing.push(`${locale}/${namespace}`);
    }
  }
  return missing;
}
