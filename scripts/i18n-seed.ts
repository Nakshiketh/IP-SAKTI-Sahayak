/**
 * Sync every locale with the English key set.
 *
 * Adds keys English has and the locale does not, using the English string as the
 * placeholder and setting `__untranslated: true` on the file. Never overwrites a
 * value that already differs from English — a real translation is safe from this
 * script. Reports keys the locale has that English does not, but does not delete
 * them; that is a decision for a person.
 *
 *   node scripts/i18n-seed.ts          write
 *   node scripts/i18n-seed.ts --check  exit non-zero if anything is out of sync
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  flatten,
  LOCALES,
  LOCALES_DIR,
  NAMESPACES,
  readNamespace,
  SOURCE_LOCALE,
  UNTRANSLATED_FLAG,
  type Json,
} from './i18n-lib.ts';

const check = process.argv.includes('--check');

/** Copy the English tree, keeping any value the locale has already translated. */
function merge(source: Json, existing: Json | null): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(source)) {
    const current = existing?.[key];
    if (typeof value === 'string') {
      out[key] = typeof current === 'string' ? current : value;
    } else {
      out[key] = merge(value, typeof current === 'object' && current ? current : null);
    }
  }
  return out;
}

let changed = 0;
let extras = 0;

for (const locale of LOCALES) {
  if (locale === SOURCE_LOCALE) continue;
  mkdirSync(join(LOCALES_DIR, locale), { recursive: true });

  for (const namespace of NAMESPACES) {
    const source = readNamespace(SOURCE_LOCALE, namespace);
    if (!source) throw new Error(`Missing source namespace: ${SOURCE_LOCALE}/${namespace}.json`);

    const existing = readNamespace(locale, namespace);
    const merged = merge(source, existing);

    const sourceKeys = flatten(source);
    const mergedKeys = flatten(merged);
    const translated = Object.keys(sourceKeys).filter(
      (key) => mergedKeys[key] !== sourceKeys[key],
    ).length;

    // The flag says "these values are English placeholders". It comes off when
    // every key has actually been translated.
    const body: Json =
      translated === Object.keys(sourceKeys).length
        ? merged
        : { [UNTRANSLATED_FLAG]: true as unknown as string, ...merged };

    if (existing) {
      for (const key of Object.keys(flatten(existing))) {
        if (!(key in sourceKeys)) {
          console.warn(`  extra key in ${locale}/${namespace}.json: ${key}`);
          extras += 1;
        }
      }
    }

    const path = join(LOCALES_DIR, locale, `${namespace}.json`);
    const next = `${JSON.stringify(body, null, 2)}\n`;
    let previous: string | null = null;
    try {
      previous = readFileSync(path, 'utf-8');
    } catch {
      previous = null;
    }

    if (previous !== next) {
      changed += 1;
      if (check) {
        console.error(`out of sync: ${locale}/${namespace}.json`);
      } else {
        writeFileSync(path, next, 'utf-8');
        console.log(`wrote ${locale}/${namespace}.json`);
      }
    }
  }
}

if (check && (changed > 0 || extras > 0)) {
  console.error('\nRun: node scripts/i18n-seed.ts');
  process.exit(1);
}

console.log(
  check
    ? 'Every locale carries the English key set.'
    : `Done. ${changed} file(s) written, ${extras} extra key(s) reported.`,
);
