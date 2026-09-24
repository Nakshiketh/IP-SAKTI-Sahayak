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
/**
 * English is split again, for the same reason the other languages were.
 *
 * `common`, `home` and `about` are what the shell and the landing page need
 * before anything is decided, so they stay eager. Every other namespace belongs
 * to a route that is already lazily loaded, and its copy is substantial — the
 * ten English files are 150 kB of source, most of it prose for pages a given
 * reader may never open. Those now arrive with their own route, requested by
 * `ensureNamespace` at the same moment the route's chunk is.
 *
 * The rule to keep: a namespace here must be loaded before anything renders
 * that reads it, because there is no i18next backend to fetch a missing one.
 * A namespace that arrived late would show dotted keys on screen.
 */
export const CORE_NAMESPACES = ['common', 'home', 'about'] as const;

const english = import.meta.glob<{ default: Record<string, unknown> }>(
  ['../locales/en/common.json', '../locales/en/home.json', '../locales/en/about.json'],
  { eager: true },
);

const englishRest = import.meta.glob<{ default: Record<string, unknown> }>([
  '../locales/en/*.json',
  '!../locales/en/common.json',
  '!../locales/en/home.json',
  '!../locales/en/about.json',
]);

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
  const source = code === DEFAULT_LOCALE ? englishRest : others;
  const wanted = Object.entries(source).filter(([path]) => parse(path)?.locale === code);
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
  for (const path of [
    ...Object.keys(english),
    ...Object.keys(englishRest),
    ...Object.keys(others),
  ]) {
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

/**
 * Make sure one namespace is available in the active language before a route
 * that reads it renders.
 *
 * Called from the lazy route definition, so the copy and the code arrive
 * together and the existing Suspense boundary covers both. Loading twice is
 * free: the module graph caches the chunk, and i18next replaces a bundle with
 * an identical one without re-rendering.
 */
export async function ensureNamespace(namespace: string, code: string): Promise<void> {
  const { i18n } = await import('./index');
  if (i18n.hasResourceBundle(code, namespace)) return;

  const source = code === DEFAULT_LOCALE ? englishRest : others;
  const entry = Object.entries(source).find(([path]) => {
    const parsed = parse(path);
    return parsed?.locale === code && parsed.namespace === namespace;
  });
  if (!entry) return;

  try {
    const module = await entry[1]();
    i18n.addResourceBundle(code, namespace, module.default, true, true);
  } catch {
    // English is already loaded as the fallback for everything but English
    // itself; for English there is nothing better to do than render the keys,
    // and hiding the failure would make it harder to notice.
  }
}

/**
 * Put every English namespace in place at once.
 *
 * For tests, which render a route's component directly rather than through the
 * router, so the `ensureNamespace` call that normally arrives with the chunk
 * never happens. Loading them all in the setup keeps each test rendering real
 * copy instead of dotted keys, without weakening the split the app relies on.
 */
export async function loadAllEnglish(): Promise<Record<string, Record<string, unknown>>> {
  const loaded: Record<string, Record<string, unknown>> = {};
  await Promise.all(
    Object.entries(englishRest).map(async ([path, load]) => {
      const parsed = parse(path);
      if (!parsed) return;
      loaded[parsed.namespace] = (await load()).default;
    }),
  );
  return loaded;
}
