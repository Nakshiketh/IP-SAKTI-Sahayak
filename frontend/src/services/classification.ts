import graph from '@classification/graph.json';

import type { ProductClass } from '@/types/domain';

/**
 * Walking the classification graph.
 *
 * The graph is the same `graph.json` the backend service loads — one file, read
 * by both halves, so the flow a reader sees and the flow the API will walk
 * cannot drift apart. It holds structure only; every string is a key into the
 * locale files and no legal consequence is stated in it.
 */

export type QuestionId =
  | 'external_use'
  | 'food_route'
  | 'therapeutic_claim'
  | 'purified_fraction'
  | 'classical_unmodified'
  | 'novel_ingredient'
  | 'human_evidence'
  | 'changed_formulation';

export type OutcomeId =
  | 'cosmetic'
  | 'ayurveda_aahar'
  | 'food_or_drug'
  | 'phytopharmaceutical'
  | 'classical_generic'
  | 'patent_proprietary'
  | 'new_non_classical_drug'
  | 'new_non_classical_drug_no_evidence';

interface Option {
  value: 'yes' | 'no';
  question?: QuestionId;
  outcome?: OutcomeId;
}

/**
 * A classification result is never "undetermined" — that is the absence of one.
 * Narrowing it here is what lets the consequence panels index the matrix safely.
 */
export type ClassifiableProduct = Exclude<ProductClass, 'undetermined'>;

interface Graph {
  start: QuestionId;
  questions: Record<QuestionId, { options: Option[] }>;
  outcomes: Record<OutcomeId, { classes: ClassifiableProduct[] }>;
}

const typed = graph as unknown as Graph;

export const START: QuestionId = typed.start;

export interface ProductClassOutcome {
  id: OutcomeId;
  classes: ClassifiableProduct[];
}

export interface WalkResult {
  /** The questions actually asked, in order. */
  asked: QuestionId[];
  /** The next question to ask, or null when an outcome has been reached. */
  next: QuestionId | null;
  outcome: ProductClassOutcome | null;
}

export type Answers = Partial<Record<QuestionId, 'yes' | 'no'>>;

export function walk(answers: Answers): WalkResult {
  const asked: QuestionId[] = [];
  let current: QuestionId | null = START;

  while (current !== null) {
    asked.push(current);
    const answer: 'yes' | 'no' | undefined = answers[current];
    if (answer === undefined) return { asked, next: current, outcome: null };

    const question: { options: Option[] } = typed.questions[current];
    const option: Option | undefined = question.options.find((o) => o.value === answer);
    if (!option) throw new Error(`Unknown answer ${answer} for ${current}`);

    if (option.outcome) {
      return {
        asked,
        next: null,
        outcome: { id: option.outcome, classes: typed.outcomes[option.outcome].classes },
      };
    }
    current = option.question ?? null;
  }

  return { asked, next: null, outcome: null };
}

/** The worst case, for the progress line. The graph is capped at eight. */
export function longestPath(): number {
  function depth(id: QuestionId): number {
    let best = 0;
    for (const option of typed.questions[id].options) {
      if (option.question) best = Math.max(best, depth(option.question));
    }
    return best + 1;
  }
  return depth(START);
}
