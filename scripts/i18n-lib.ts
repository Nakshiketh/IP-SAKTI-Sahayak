/**
 * Shared helpers for the locale scripts.
 *
 * English is the source of truth. Every other locale is measured against it, and
 * neither script ever invents a translation — seeding copies the English string
 * and marks the file so the copy cannot be mistaken for a translation.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The locales and namespaces come from the app itself, not from a copy here.
 *
 * They were two lists for a while, and a namespace added to one was a namespace
 * these scripts silently did not seed — the new locale files simply never
 * appeared, and the first sign of it was raw keys on screen in five languages.
 * `languages.ts` imports nothing, so reading it from a script costs nothing.
 */
import { LOCALE_CODES, NAMESPACES as APP_NAMESPACES } from '../frontend/src/i18n/languages.ts';

export const REPO_ROOT = join(import.meta.dirname, '..');
export const LOCALES_DIR = join(REPO_ROOT, 'frontend', 'src', 'locales');

export const SOURCE_LOCALE = 'en';
export const LOCALES = LOCALE_CODES;
export const NAMESPACES = APP_NAMESPACES;

/** Marks a file whose values are English placeholders, not translations. */
export const UNTRANSLATED_FLAG = '__untranslated';

export type Json = { [key: string]: string | Json };

export function readNamespace(locale: string, namespace: string): Json | null {
  try {
    return JSON.parse(
      readFileSync(join(LOCALES_DIR, locale, `${namespace}.json`), 'utf-8'),
    ) as Json;
  } catch {
    return null;
  }
}

/** "a.b.c" -> value, so two trees can be compared key by key. */
export function flatten(node: Json, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === UNTRANSLATED_FLAG) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

export function listLocaleDirs(): string[] {
  try {
    return readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
