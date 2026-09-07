/**
 * Shared helpers for the locale scripts.
 *
 * English is the source of truth. Every other locale is measured against it, and
 * neither script ever invents a translation — seeding copies the English string
 * and marks the file so the copy cannot be mistaken for a translation.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REPO_ROOT = join(import.meta.dirname, '..');
export const LOCALES_DIR = join(REPO_ROOT, 'frontend', 'src', 'locales');

export const SOURCE_LOCALE = 'en';
export const LOCALES = ['en', 'hi', 'te', 'ta', 'bn', 'mr'] as const;
export const NAMESPACES = [
  'common',
  'home',
  'sahayak',
  'covered',
  'howitworks',
  'sources',
  'about',
] as const;

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
