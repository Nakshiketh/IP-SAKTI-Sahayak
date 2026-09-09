/**
 * The bundle budget.
 *
 * Measures what a first-time reader on the homepage actually downloads before
 * anything renders — the entry script, the modules it statically imports, and
 * the stylesheet — compressed, because that is what crosses the network.
 *
 * Route chunks are deliberately not counted. They are fetched when a reader
 * visits that route, and rolling them into one number would mean adding a page
 * made the homepage slower, which is not true and would push whoever sees the
 * failure towards the wrong fix.
 *
 * The budget is a ceiling, not a target. It exists because this bundle once
 * carried half a megabyte of locale files for five languages the reader was
 * never going to see, and nothing failed — the number only became visible when
 * somebody went looking. A build is the right place to go looking.
 *
 *   node frontend/scripts/check-bundle.ts
 *   node frontend/scripts/check-bundle.ts --json
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Gzipped kilobytes a reader downloads before the homepage renders. */
const BUDGET_KB = 150;

const DIST = join(import.meta.dirname, '..', 'dist');
const ASSETS = join(DIST, 'assets');

function gzipKb(paths: string[]): number {
  const total = paths.reduce((sum, path) => sum + gzipSync(readFileSync(path)).length, 0);
  return Math.round((total / 1024) * 10) / 10;
}

/**
 * What `index.html` actually pulls in: the entry module, everything modulepreloaded
 * alongside it, and the stylesheet. Read from the built HTML rather than guessed
 * from filenames, so a change in how Vite chunks things cannot quietly stop the
 * check from measuring the real thing.
 */
function initialAssets(): string[] {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  const names = new Set<string>();
  for (const match of html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)) {
    const name = match[1];
    if (name && (name.endsWith('.js') || name.endsWith('.css'))) names.add(name);
  }
  return [...names].map((name) => join(ASSETS, name));
}

function main(): number {
  let assets: string[];
  try {
    assets = initialAssets();
  } catch {
    console.error('No build to measure. Run `npm run build` first.');
    return 2;
  }

  if (assets.length === 0) {
    console.error('index.html references no assets, which cannot be right.');
    return 2;
  }

  const size = gzipKb(assets);
  const everything = gzipKb(
    readdirSync(ASSETS)
      .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
      .map((name) => join(ASSETS, name)),
  );

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ initialKb: size, allChunksKb: everything, budgetKb: BUDGET_KB }));
  } else {
    console.log(`Initial load  ${size} kB gzipped  (budget ${BUDGET_KB} kB)`);
    for (const path of assets.sort()) {
      console.log(`  ${gzipKb([path]).toString().padStart(6)} kB  ${path.split(/[\\/]/).pop()}`);
    }
    console.log(`All chunks    ${everything} kB gzipped, fetched as they are visited`);
  }

  if (size > BUDGET_KB) {
    console.error(
      `\nOver budget by ${Math.round((size - BUDGET_KB) * 10) / 10} kB. ` +
        'Either something large joined the first chunk, or the budget needs ' +
        'raising on purpose — but raise it in a commit that says why.',
    );
    return 1;
  }
  return 0;
}

process.exit(main());
