import vocabulary from '@analyst/vocabulary.json';

/**
 * Reference vocabulary for the product assessment.
 *
 * What this is: a list of ingredients recognised in traditional Ayurvedic use,
 * a handful of classical formulations, and words that describe a product rather
 * than name it. What it is not: a search of any register, or a statement that
 * any particular preparation is in any particular text. It lets the assessment
 * say "this ingredient is recognised in traditional use" — a navigational fact —
 * and never "this is not new", which only an examiner decides.
 *
 * The lists live in `backend/app/analyst/data/vocabulary.json`, which the
 * invention analyst reads too, so the step form and the conversation cannot
 * disagree about what an ingredient is called. Names are matched as whole words
 * after folding case and punctuation, longest name first, so "Daru Haldi" is
 * tree turmeric rather than turmeric. Labels are proper names and are not
 * translated.
 */

export interface ReferenceIngredient {
  id: string;
  label: string;
  names: readonly string[];
}

export interface ClassicalFormulation {
  id: string;
  label: string;
  /** Names the preparation is sold or described under. */
  names: readonly string[];
  /**
   * Its defining ingredients, where the set is short and well settled. Only
   * these few are matched on composition; the rest are matched on name alone.
   */
  ingredients?: readonly string[];
}

export const TRADITIONAL_INGREDIENTS: readonly ReferenceIngredient[] =
  vocabulary.traditional_ingredients;

export const CLASSICAL_FORMULATIONS: readonly ClassicalFormulation[] =
  vocabulary.classical_formulations;

/**
 * Words that say what a product is or how good it is, rather than whose it is.
 * A name built from them is generally hard to register as a trade mark.
 */
export const DESCRIPTIVE_WORDS: readonly string[] = vocabulary.descriptive_words;
