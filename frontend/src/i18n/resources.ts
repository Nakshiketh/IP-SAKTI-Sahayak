import { DEFAULT_LOCALE, LOCALE_CODES, NAMESPACES, type LocaleCode } from './languages';

/**
 * Locale files: English in the first chunk, every other language on request.
 *
 * This used to bundle all six eagerly, on the reasoning that six languages of
 * short interface copy is a few kilobytes. That stopped being true. The six
 * locales are now half a megabyte of source, and every reader was downloading
 * all of it before the first paint to read one of them — a page that has to
 * arrive over a phone connection cannot spend its budget on five languages
 * nobody in that session will see.
 *
 * So English is eager, because it is the fallback and something has to be able
 * to render when a fetch fails. The other five are separate chunks, fetched when
 * a reader is actually in that language. The cost is one request on a language
 * switch; the saving is roughly four fifths of the first load.
 *
 * `findMissingBundles` still checks all six, from the glob's keys rather than
 * its contents — a missing file is caught without any file being loaded.
 */
const english = import.meta.glob<{ default: Record<string, unknown> }>('../locales/en/*.json', {
  eager: true,
});

// English is excluded rather than merely unused. Left in, every English file
// would be both statically and dynamically imported, which Rollup reports as a
// warning per file and resolves by keeping the module in the main chunk anyway
// — eight warnings saying the split did not happen for the one locale that was
// never meant to be split.
const others = import.meta.glob<{ default: Record<string, unknown> }>([
  '../locales/*/*.json',
  '!../locales/en/*.json',
]);

type Bundle = Record<string, Record<string, Record<string, unknown>>>;

function parse(path: string): { locale: string; namespace: string } | null {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) return null;
  const [, locale, namespace] = match;
  if (!locale || !namespace) return null;
  return { locale, namespace };
}

function buildEnglish(): Bundle {
  const bundle: Bundle = {};
  for (const [path, module] of Object.entries(english)) {
    const parsed = parse(path);
    if (!parsed) continue;
    const namespaces = (bundle[parsed.locale] ??= {});
    namespaces[parsed.namespace] = module.default;
  }
  return bundle;
}

/** What i18next is initialised with: English, and nothing else. */
export const resources = buildEnglish();

/**
 * Fetch one locale's namespaces.
 *
 * Resolves to the namespaces it managed to load. A namespace whose chunk fails
 * to arrive is left out rather than faked, and i18next falls back to English for
 * it — a reader seeing one section in English is better served than a reader
 * seeing raw dotted keys.
 */
export async function loadLocale(
  code: LocaleCode,
): Promise<Record<string, Record<string, unknown>>> {
  if (code === DEFAULT_LOCALE) return resources[DEFAULT_LOCALE] ?? {};

  const wanted = Object.entries(others).filter(([path]) => parse(path)?.locale === code);
  const loaded: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    wanted.map(async ([path, load]) => {
      const parsed = parse(path);
      if (!parsed) return;
      try {
        const module = await load();
        loaded[parsed.namespace] = module.default;
      } catch {
        // Left out on purpose. See above.
      }
    }),
  );

  return loaded;
}

/**
 * Fail the build rather than ship a locale with a missing namespace: a missing
 * file shows up as a raw key on screen, which is worse than English text.
 *
 * Checked against the glob's keys, so this stays a cheap startup assertion
 * rather than a reason to load every language after all.
 */
export function findMissingBundles(): string[] {
  const present = new Set<string>();
  for (const path of [...Object.keys(english), ...Object.keys(others)]) {
    const parsed = parse(path);
    if (parsed) present.add(`${parsed.locale}/${parsed.namespace}`);
  }

  const missing: string[] = [];
  for (const locale of LOCALE_CODES) {
    for (const namespace of NAMESPACES) {
      if (!present.has(`${locale}/${namespace}`)) missing.push(`${locale}/${namespace}`);
    }
  }
  return missing;
}
