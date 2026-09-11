import {
  CLASSICAL_FORMULATIONS,
  DESCRIPTIVE_WORDS,
  TRADITIONAL_INGREDIENTS,
  type ClassicalFormulation,
  type ReferenceIngredient,
} from '@/services/assessmentReference';
import type { ProductClass, Record_ } from '@/types/domain';

/**
 * The product assessment: what a reader tells us, and what can honestly be
 * said back.
 *
 * Everything here is pure, so the rules can be tested without a page. Two kinds
 * of evidence can raise "something similar exists":
 *
 *  - a filed record from the records store that shares the product's words, and
 *  - documented prior knowledge: a classical formulation the product matches by
 *    name or by its defining ingredients.
 *
 * Neither is a finding of infringement or of unpatentability. The first is
 * evidence of what somebody filed; the second is prior art an examiner would
 * weigh. The result says which, and says what to look at next.
 */

export const CATEGORIES = [
  'hair',
  'skin',
  'food',
  'medicine',
  'cosmetic',
  'herbal',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const NOVELTY = [
  'combination',
  'proportions',
  'process',
  'extract',
  'dosageForm',
  'effect',
  'none',
] as const;
export type Novelty = (typeof NOVELTY)[number];

export const WORKS = ['packaging', 'logo', 'writing', 'media', 'software'] as const;
export type Work = (typeof WORKS)[number];

export const CONFIDENTIAL = ['formula', 'process', 'sourcing', 'data'] as const;
export type Confidential = (typeof CONFIDENTIAL)[number];

export type YesNo = 'yes' | 'no';
export type Disclosed = 'yes' | 'no' | 'unsure';

export interface AssessmentInput {
  category: Category | null;
  name: string;
  purpose: string;
  problem: string;
  difference: string;
  users: string;
  ingredients: string[];
  formulation: string;
  novelty: Novelty[];
  brand: YesNo | null;
  works: Work[];
  confidential: Confidential[];
  disclosed: Disclosed | null;
}

export const EMPTY_INPUT: AssessmentInput = {
  category: null,
  name: '',
  purpose: '',
  problem: '',
  difference: '',
  users: '',
  ingredients: [],
  formulation: '',
  novelty: [],
  brand: null,
  works: [],
  confidential: [],
  disclosed: null,
};

export const STEPS = ['category', 'details', 'ingredients', 'protection', 'result', 'guidance'] as const;
export type StepId = (typeof STEPS)[number];

export const IP_TYPES = ['patent', 'trademark', 'copyright', 'tradeSecret'] as const;
export type IpType = (typeof IP_TYPES)[number];

// -- text matching -----------------------------------------------------------

/** Case, accents and punctuation folded away; words separated by one space. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    // Latin accents only: Indic scripts carry their vowel signs as marks too,
    // and stripping those would change the word.
    .replace(/(?<=[a-zA-Z])\p{M}+/gu, '')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Whether `phrase` occurs in `text` as whole words. */
export function hasPhrase(text: string, phrase: string): boolean {
  const folded = fold(phrase);
  return folded.length > 0 && ` ${fold(text)} `.includes(` ${folded} `);
}

/**
 * The ingredient an entry names — the one whose matching name is longest, so
 * "Daru Haldi" is tree turmeric and not turmeric, the same rule the analyst uses.
 */
export function recogniseIngredient(entry: string): ReferenceIngredient | null {
  let best: { ingredient: ReferenceIngredient; size: number } | null = null;
  for (const ingredient of TRADITIONAL_INGREDIENTS) {
    for (const name of ingredient.names) {
      if (!hasPhrase(entry, name)) continue;
      const size = fold(name).split(' ').length;
      if (!best || size > best.size) best = { ingredient, size };
    }
  }
  return best?.ingredient ?? null;
}

export interface ClassicalMatch {
  formulation: ClassicalFormulation;
  via: 'name' | 'ingredients';
}

export function findClassical(input: AssessmentInput): ClassicalMatch[] {
  const text = [input.name, input.formulation, input.difference, ...input.ingredients].join(' ');
  const known = new Set(
    input.ingredients.map(recogniseIngredient).flatMap((found) => (found ? [found.id] : [])),
  );
  const matches: ClassicalMatch[] = [];
  for (const formulation of CLASSICAL_FORMULATIONS) {
    if (formulation.names.some((name) => hasPhrase(text, name))) {
      matches.push({ formulation, via: 'name' });
    } else if (formulation.ingredients?.every((id) => known.has(id))) {
      matches.push({ formulation, via: 'ingredients' });
    }
  }
  return matches;
}

/** The words of a brand name that describe the product rather than name it. */
export function descriptiveWords(name: string): string[] {
  const words = fold(name).split(' ').filter(Boolean);
  const found = new Set<string>();
  for (const word of words) {
    if (DESCRIPTIVE_WORDS.includes(word)) found.add(word);
  }
  for (const ingredient of TRADITIONAL_INGREDIENTS) {
    const hit = ingredient.names.find((candidate) => hasPhrase(name, candidate));
    if (hit) found.add(hit);
  }
  return [...found];
}

/** Nice classes a mark for this kind of product is usually filed in. */
export function trademarkClasses(category: Category | null): number[] {
  switch (category) {
    case 'hair':
    case 'skin':
      return [3, 5];
    case 'cosmetic':
      return [3];
    case 'food':
      return [5, 29, 30];
    case 'medicine':
      return [5];
    case 'herbal':
      return [3, 5, 30];
    default:
      return [3, 5];
  }
}

/** The regulatory class this category most often lands in — to be confirmed. */
export function likelyProductClass(category: Category | null): ProductClass {
  switch (category) {
    case 'hair':
    case 'skin':
    case 'cosmetic':
      return 'cosmetic';
    case 'food':
      return 'ayurveda_aahar';
    case 'medicine':
      return 'patent_proprietary';
    default:
      return 'undetermined';
  }
}

const STOP = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'our',
  'your',
  'are',
  'which',
  'helps',
  'help',
  'used',
  'using',
  'made',
  'into',
  'also',
  'more',
  'less',
]);

export interface SearchTerms {
  name: string[];
  ingredients: string[];
  use: string[];
}

/**
 * The words sent to search filed records. Names and a few words of purpose —
 * never the formulation details or proportions, which stay in the browser.
 */
export function searchTerms(input: AssessmentInput): SearchTerms {
  const words = (text: string, min: number) =>
    fold(text)
      .split(' ')
      .filter((word) => word.length >= min && !STOP.has(word) && !/^\d+$/.test(word));

  const name = [...new Set(words(input.name, 3))].slice(0, 4);
  const ingredients = [
    ...new Set(
      input.ingredients.map((entry) => {
        const known = recogniseIngredient(entry);
        return known ? fold(known.names[0]!) : words(entry, 3).slice(0, 2).join(' ');
      }),
    ),
  ]
    .filter(Boolean)
    .slice(0, 10);
  const use = [...new Set(words(input.purpose, 4))].slice(0, 4);
  return { name, ingredients, use };
}

export function allTerms(terms: SearchTerms): string[] {
  return [...new Set([...terms.name, ...terms.ingredients, ...terms.use])];
}

// -- validation --------------------------------------------------------------

export type FieldError =
  | 'required'
  | 'tooShort'
  | 'tooLong'
  | 'noIngredients'
  | 'noNovelty'
  | 'noneWithOthers'
  | 'choose';

export type Errors = Partial<Record<string, FieldError>>;

const LIMITS = { name: 80, text: 600 } as const;

export function validate(step: StepId, input: AssessmentInput): Errors {
  const errors: Errors = {};
  if (step === 'category' && !input.category) errors.category = 'choose';

  if (step === 'details') {
    const name = input.name.trim();
    if (!name) errors.name = 'required';
    else if (name.length < 2) errors.name = 'tooShort';
    else if (name.length > LIMITS.name) errors.name = 'tooLong';
    if (!input.purpose.trim()) errors.purpose = 'required';
    for (const field of ['purpose', 'problem', 'difference', 'users'] as const) {
      if (input[field].length > LIMITS.text) errors[field] = 'tooLong';
    }
  }

  if (step === 'ingredients') {
    if (input.ingredients.length === 0) errors.ingredients = 'noIngredients';
    if (input.novelty.length === 0) errors.novelty = 'noNovelty';
    else if (input.novelty.includes('none') && input.novelty.length > 1)
      errors.novelty = 'noneWithOthers';
    if (input.formulation.length > LIMITS.text * 2) errors.formulation = 'tooLong';
  }

  if (step === 'protection') {
    if (!input.brand) errors.brand = 'choose';
    if (!input.disclosed) errors.disclosed = 'choose';
  }
  return errors;
}

// -- the assessment ----------------------------------------------------------

export type Aspect = 'name' | 'ingredients' | 'use';

export interface RecordMatch {
  record: Record_;
  matched: string[];
  aspects: Aspect[];
}

export interface RecordsOutcome {
  /** `empty`: nothing is loaded in the store, so nothing could be compared. */
  state: 'searched' | 'empty' | 'failed';
  recordCount: number;
  records: Record_[];
}

export function matchRecords(records: Record_[], terms: SearchTerms): RecordMatch[] {
  return records.flatMap((record) => {
    const text = [record.title, record.abstract_text, record.applicant, record.goods_or_field]
      .filter(Boolean)
      .join(' ');
    const aspects = new Set<Aspect>();
    const matched: string[] = [];
    (['name', 'ingredients', 'use'] as const).forEach((aspect) => {
      for (const term of terms[aspect]) {
        if (hasPhrase(text, term)) {
          matched.push(term);
          aspects.add(aspect);
        }
      }
    });
    return matched.length > 0 ? [{ record, matched: [...new Set(matched)], aspects: [...aspects] }] : [];
  });
}

const PATENT_RECORDS = new Set(['patent_application', 'patent_grant']);

export type PatentConsideration =
  | 'tk'
  | 'admixture'
  | 'knownForm'
  | 'process'
  | 'effect'
  | 'disclosed'
  | 'disclosedUnsure';

export type NextStep =
  | 'reviewPriorArt'
  | 'officialPatentSearch'
  | 'professionalSearch'
  | 'confirmClass'
  | 'trademarkSearch'
  | 'keepConfidential'
  | 'recordWorks'
  | 'consultProfessional';

export interface Assessment {
  patent: {
    status: 'similar' | 'possible' | 'limited';
    classical: ClassicalMatch[];
    known: ReferenceIngredient[];
    unrecognised: string[];
    records: RecordMatch[];
    considerations: PatentConsideration[];
  };
  trademark: {
    status: 'similar' | 'check' | 'clear' | 'none';
    descriptive: string[];
    classical: string[];
    records: RecordMatch[];
    classes: number[];
  };
  copyright: { status: 'relevant' | 'none'; works: Work[] };
  tradeSecret: { status: 'relevant' | 'none'; items: Confidential[]; tradeOff: boolean };
  records: RecordsOutcome;
  similarFound: boolean;
  recommended: IpType[];
  nextSteps: NextStep[];
}

export function assess(input: AssessmentInput, records: RecordsOutcome): Assessment {
  const terms = searchTerms(input);
  const matches = matchRecords(records.records, terms);

  // -- patent
  const classical = findClassical(input);
  const known: ReferenceIngredient[] = [];
  const unrecognised: string[] = [];
  for (const entry of input.ingredients) {
    const found = recogniseIngredient(entry);
    if (found) {
      if (!known.some((k) => k.id === found.id)) known.push(found);
    } else unrecognised.push(entry);
  }
  // A patent record shares a word, and at least two distinct words, or it is
  // noise from one common term.
  const patentRecords = matches.filter(
    (m) => PATENT_RECORDS.has(m.record.record_type) && m.matched.length >= 2,
  );
  const novelty = new Set(input.novelty);
  const substantive = (['combination', 'process', 'extract', 'dosageForm', 'effect'] as const).some(
    (n) => novelty.has(n),
  );
  const considerations: PatentConsideration[] = [];
  if (known.length > 0 || classical.length > 0) considerations.push('tk');
  if (novelty.has('combination') || novelty.has('proportions')) considerations.push('admixture');
  if (novelty.has('extract') || novelty.has('dosageForm')) considerations.push('knownForm');
  if (novelty.has('process')) considerations.push('process');
  if (novelty.has('effect')) considerations.push('effect');
  if (input.disclosed === 'yes') considerations.push('disclosed');
  if (input.disclosed === 'unsure') considerations.push('disclosedUnsure');

  const patentStatus =
    classical.length > 0 || patentRecords.length > 0
      ? 'similar'
      : substantive
        ? 'possible'
        : 'limited';

  // -- trademark
  const trademarkRecords = matches.filter(
    (m) => m.record.record_type === 'trademark' && m.aspects.includes('name'),
  );
  const descriptive = input.brand === 'yes' ? descriptiveWords(input.name) : [];
  const classicalInName =
    input.brand === 'yes'
      ? CLASSICAL_FORMULATIONS.filter((f) => f.names.some((n) => hasPhrase(input.name, n))).map(
          (f) => f.label,
        )
      : [];
  const trademarkStatus =
    input.brand !== 'yes'
      ? 'none'
      : trademarkRecords.length > 0
        ? 'similar'
        : descriptive.length > 0 || classicalInName.length > 0
          ? 'check'
          : 'clear';

  // -- copyright and trade secret
  const copyrightStatus = input.works.length > 0 ? 'relevant' : 'none';
  const tradeSecretStatus = input.confidential.length > 0 ? 'relevant' : 'none';
  const tradeOff =
    patentStatus !== 'limited' &&
    (input.confidential.includes('formula') || input.confidential.includes('process'));

  const recommended = IP_TYPES.filter((type) => {
    if (type === 'patent') return patentStatus === 'possible';
    if (type === 'trademark') return input.brand === 'yes';
    if (type === 'copyright') return copyrightStatus === 'relevant';
    return tradeSecretStatus === 'relevant';
  });

  const nextSteps: NextStep[] = [];
  if (patentStatus === 'similar') nextSteps.push('reviewPriorArt');
  if (patentStatus !== 'limited') nextSteps.push('officialPatentSearch', 'professionalSearch');
  nextSteps.push('confirmClass');
  if (input.brand === 'yes') nextSteps.push('trademarkSearch');
  if (patentStatus === 'possible' || tradeSecretStatus === 'relevant')
    nextSteps.push('keepConfidential');
  if (copyrightStatus === 'relevant') nextSteps.push('recordWorks');
  nextSteps.push('consultProfessional');

  return {
    patent: {
      status: patentStatus,
      classical,
      known,
      unrecognised,
      records: patentRecords,
      considerations,
    },
    trademark: {
      status: trademarkStatus,
      descriptive,
      classical: classicalInName,
      records: trademarkRecords,
      classes: trademarkClasses(input.category),
    },
    copyright: { status: copyrightStatus, works: input.works },
    tradeSecret: { status: tradeSecretStatus, items: input.confidential, tradeOff },
    records,
    similarFound: patentStatus === 'similar' || trademarkStatus === 'similar',
    recommended,
    nextSteps,
  };
}
