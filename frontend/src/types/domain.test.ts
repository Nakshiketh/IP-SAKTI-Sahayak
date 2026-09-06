/**
 * The other half of the drift test.
 *
 * `backend/tests/test_schema_drift.py` proves the checked-in schema matches the
 * Pydantic model. This proves the TypeScript types match the checked-in schema.
 * Together they mean the two halves of the contract cannot drift apart silently.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DOMAIN_ENUMS, DOMAIN_FIELDS } from '@/types/domain';

interface EnumDef {
  enum: string[];
}
interface ModelDef {
  properties: Record<string, unknown>;
  required?: string[];
}
type Defs = Record<string, EnumDef | ModelDef>;

// vitest runs with the frontend package as cwd; the schema is a repo-level artefact.
const schemaPath = resolve(process.cwd(), '..', 'schemas', 'domain.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as {
  $defs: Defs;
};
const defs = schema.$defs;

describe('domain schema contract', () => {
  it('every declared enum exists in the generated schema', () => {
    for (const name of Object.keys(DOMAIN_ENUMS)) {
      expect(defs[name], `${name} missing from schemas/domain.schema.json`).toBeDefined();
    }
  });

  it('every declared model exists in the generated schema', () => {
    for (const name of Object.keys(DOMAIN_FIELDS)) {
      expect(defs[name], `${name} missing from schemas/domain.schema.json`).toBeDefined();
    }
  });

  it.each(Object.entries(DOMAIN_ENUMS))('%s union matches the schema', (name, values) => {
    const def = defs[name] as EnumDef;
    expect([...values]).toEqual(def.enum);
  });

  it.each(Object.entries(DOMAIN_FIELDS))('%s fields match the schema', (name, fields) => {
    const def = defs[name] as ModelDef;
    expect([...fields]).toEqual(Object.keys(def.properties));
  });

  it('the schema declares nothing the TypeScript side has not mirrored', () => {
    const declared = new Set([...Object.keys(DOMAIN_ENUMS), ...Object.keys(DOMAIN_FIELDS)]);
    const missing = Object.keys(defs).filter((name) => !declared.has(name));
    expect(missing, 'these schema definitions have no TypeScript counterpart').toEqual([]);
  });

  it('a record can never be marked citable', () => {
    // Registry data is evidence of what was filed or granted, not a statement of
    // law. The Python side pins this with Literal[False]; the schema must agree.
    const record = defs.Record as ModelDef;
    expect(record.properties.citable_in_answers).toMatchObject({ const: false });
  });
});
