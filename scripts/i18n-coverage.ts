/**
 * Per-locale translation coverage.
 *
 * A key counts as translated when its value differs from the English one. That
 * is a blunt measure — a genuine translation that happens to match English (a
 * proper noun, say) reads as untranslated — but it errs toward understating
 * coverage, which is the right direction for a number that will be shown to
 * someone deciding whether to trust an answer in their language.
 *
 *   node scripts/i18n-coverage.ts
 *   node scripts/i18n-coverage.ts --json
 */

import {
  flatten,
  LOCALES,
  listLocaleDirs,
  NAMESPACES,
  readNamespace,
  SOURCE_LOCALE,
  UNTRANSLATED_FLAG,
} from './i18n-lib.ts';

interface Row {
  locale: string;
  namespaces: number;
  keys: number;
  translated: number;
  missing: string[];
  flagged: number;
}

const rows: Row[] = [];

for (const locale of LOCALES) {
  const row: Row = { locale, namespaces: 0, keys: 0, translated: 0, missing: [], flagged: 0 };

  for (const namespace of NAMESPACES) {
    const source = readNamespace(SOURCE_LOCALE, namespace);
    if (!source) continue;
    const sourceKeys = flatten(source);

    const target = readNamespace(locale, namespace);
    if (!target) {
      row.missing.push(`${namespace}.json`);
      row.keys += Object.keys(sourceKeys).length;
      continue;
    }

    row.namespaces += 1;
    if (target[UNTRANSLATED_FLAG]) row.flagged += 1;

    const targetKeys = flatten(target);
    for (const [key, english] of Object.entries(sourceKeys)) {
      row.keys += 1;
      const value = targetKeys[key];
      if (value === undefined) row.missing.push(`${namespace}.${key}`);
      else if (locale === SOURCE_LOCALE || value !== english) row.translated += 1;
    }
  }

  rows.push(row);
}

const unexpected = listLocaleDirs().filter((dir) => !LOCALES.includes(dir as never));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows, unexpected }, null, 2));
} else {
  const pad = (value: string | number, width: number) => String(value).padEnd(width);
  const padStart = (value: string | number, width: number) => String(value).padStart(width);

  console.log('\nTranslation coverage\n');
  console.log(
    `${pad('locale', 8)}${padStart('files', 6)}${padStart('keys', 6)}${padStart('done', 6)}${padStart('%', 6)}${padStart('missing', 9)}${padStart('flagged', 9)}`,
  );
  console.log('-'.repeat(50));

  for (const row of rows) {
    const percent = row.keys === 0 ? 0 : Math.round((row.translated / row.keys) * 100);
    console.log(
      `${pad(row.locale, 8)}${padStart(`${row.namespaces}/${NAMESPACES.length}`, 6)}${padStart(row.keys, 6)}${padStart(row.translated, 6)}${padStart(`${percent}%`, 6)}${padStart(row.missing.length, 9)}${padStart(row.flagged, 9)}`,
    );
  }

  console.log(
    `\n${rows.length} locales, ${NAMESPACES.length} namespaces each.` +
      ' "flagged" counts files still carrying __untranslated.',
  );

  const withMissing = rows.filter((row) => row.missing.length > 0);
  if (withMissing.length > 0) {
    console.log('\nMissing keys:');
    for (const row of withMissing) {
      console.log(`  ${row.locale}: ${row.missing.slice(0, 8).join(', ')}`);
      if (row.missing.length > 8) console.log(`    ...and ${row.missing.length - 8} more`);
    }
    console.log('\nRun: node scripts/i18n-seed.ts');
  }

  if (unexpected.length > 0) {
    console.log(`\nLocale directories not in the configured set: ${unexpected.join(', ')}`);
  }
}
