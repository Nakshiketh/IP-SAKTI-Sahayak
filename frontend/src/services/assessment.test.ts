import { describe, expect, it } from 'vitest';

import {
  allTerms,
  assess,
  descriptiveWords,
  EMPTY_INPUT,
  findClassical,
  recogniseIngredient,
  searchTerms,
  validate,
  type AssessmentInput,
  type RecordsOutcome,
} from '@/services/assessment';
import type { Record_ } from '@/types/domain';

const EMPTY_STORE: RecordsOutcome = { state: 'empty', recordCount: 0, records: [] };

function input(overrides: Partial<AssessmentInput>): AssessmentInput {
  return { ...EMPTY_INPUT, category: 'hair', name: 'Keshini', purpose: 'Reduces hair fall', brand: 'yes', disclosed: 'no', ...overrides };
}

function record(overrides: Partial<Record_>): Record_ {
  return {
    record_id: 'r1',
    source_id: 's1',
    jurisdiction: 'IN',
    record_type: 'patent_application',
    title: '',
    applicant: null,
    inventor_or_proprietor: null,
    filing_date: null,
    publication_date: null,
    grant_or_registration_date: null,
    status: null,
    classification_codes: [],
    goods_or_field: null,
    abstract_text: null,
    snapshot_at: null,
    citable_in_answers: false,
    ...overrides,
  };
}

describe('recognising ingredients', () => {
  it('recognises a traditional ingredient inside a longer entry', () => {
    expect(recogniseIngredient('Ashwagandha root extract (5%)')?.id).toBe('ashwagandha');
    expect(recogniseIngredient('Haldi')?.id).toBe('turmeric');
  });

  it('does not recognise a word that merely contains a name', () => {
    expect(recogniseIngredient('Neemrana clay')).toBeNull();
    expect(recogniseIngredient('Hyaluronic acid')).toBeNull();
  });
});

describe('prior knowledge', () => {
  it('finds a classical formulation by its defining ingredients, not only its name', () => {
    const found = findClassical(input({ ingredients: ['Amla', 'Harad', 'Baheda powder'] }));
    expect(found.map((m) => [m.formulation.id, m.via])).toEqual([['triphala', 'ingredients']]);
  });

  it('finds one by name', () => {
    const found = findClassical(input({ name: 'Our Chyawanprash' }));
    expect(found[0]?.formulation.id).toBe('chyawanprash');
  });

  it('reports potentially similar prior art when a classical formulation matches', () => {
    const result = assess(
      input({ ingredients: ['amla', 'haritaki', 'bibhitaki'], novelty: ['none'] }),
      EMPTY_STORE,
    );
    expect(result.patent.status).toBe('similar');
    expect(result.similarFound).toBe(true);
  });

  it('never calls a formulation new just because an ingredient is unrecognised', () => {
    const result = assess(input({ ingredients: ['Xylocarpine'], novelty: ['none'] }), EMPTY_STORE);
    expect(result.patent.unrecognised).toEqual(['Xylocarpine']);
    expect(result.patent.status).toBe('limited');
    expect(result.recommended).not.toContain('patent');
  });

  it('treats a new process as something that may be protectable, with the known-substance caveats', () => {
    const result = assess(
      input({ ingredients: ['Bhringraj', 'Coconut oil'], novelty: ['process', 'extract'] }),
      EMPTY_STORE,
    );
    expect(result.patent.status).toBe('possible');
    expect(result.patent.considerations).toEqual(expect.arrayContaining(['tk', 'knownForm', 'process']));
    expect(result.similarFound).toBe(false);
  });
});

describe('filed records', () => {
  it('reports a patent record that shares two of the product’s words', () => {
    const records: RecordsOutcome = {
      state: 'searched',
      recordCount: 10,
      records: [record({ title: 'Herbal hair oil comprising bhringraj and coconut oil' })],
    };
    const result = assess(
      input({ ingredients: ['Bhringraj', 'Coconut oil'], novelty: ['combination'] }),
      records,
    );
    expect(result.patent.status).toBe('similar');
    expect(result.patent.records[0]?.matched).toEqual(expect.arrayContaining(['bhringraj']));
    expect(result.patent.records[0]?.aspects).toContain('ingredients');
  });

  it('reports a trade mark record only when it shares the name', () => {
    const records: RecordsOutcome = {
      state: 'searched',
      recordCount: 10,
      records: [record({ record_type: 'trademark', title: 'KESHINI' })],
    };
    expect(assess(input({ ingredients: ['neem'], novelty: ['none'] }), records).trademark.status).toBe(
      'similar',
    );
  });

  it('finds nothing in an empty store, and says the store was empty', () => {
    const result = assess(input({ ingredients: ['neem'], novelty: ['process'] }), EMPTY_STORE);
    expect(result.records.state).toBe('empty');
    expect(result.similarFound).toBe(false);
  });
});

describe('the brand name', () => {
  it('flags the words that describe the product', () => {
    expect(descriptiveWords('Pure Neem Hair Oil')).toEqual(
      expect.arrayContaining(['pure', 'hair', 'oil', 'neem']),
    );
    expect(descriptiveWords('Keshini')).toEqual([]);
  });

  it('is not assessed when there is no brand', () => {
    expect(assess(input({ brand: 'no', ingredients: ['neem'], novelty: ['none'] }), EMPTY_STORE).trademark.status).toBe('none');
  });
});

describe('what is sent to search', () => {
  it('sends names and a few words of purpose, never the formulation details', () => {
    const terms = allTerms(
      searchTerms(
        input({
          ingredients: ['Bhringraj 12%'],
          formulation: 'secret-ratio cold-pressed at 42 degrees',
        }),
      ),
    );
    expect(terms).toContain('bhringraj');
    expect(terms.join(' ')).not.toMatch(/secret|42|pressed/);
  });
});

describe('validation', () => {
  it('asks for a category, a name, a purpose, ingredients and what is new', () => {
    expect(validate('category', EMPTY_INPUT)).toEqual({ category: 'choose' });
    expect(validate('details', EMPTY_INPUT)).toMatchObject({ name: 'required', purpose: 'required' });
    expect(validate('ingredients', EMPTY_INPUT)).toMatchObject({
      ingredients: 'noIngredients',
      novelty: 'noNovelty',
    });
  });

  it('refuses "nothing new" alongside a claimed novelty', () => {
    expect(validate('ingredients', input({ ingredients: ['neem'], novelty: ['none', 'process'] }))).toEqual({
      novelty: 'noneWithOthers',
    });
  });
});
