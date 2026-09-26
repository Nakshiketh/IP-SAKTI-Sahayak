import type { Conversation } from '@/services/analyst';

/**
 * Turn an analysed product into a question Ask Sahayak can answer.
 *
 * Check My Product and Ask Sahayak are two halves of one product, and until now
 * the only bridge between them handed over whatever the reader last typed. That
 * is the wrong thing to carry. By the time an analysis exists, the analyst has
 * a structured record — the composition with percentages, the form, the
 * intended use, what it could not settle — and a question built from that is
 * answerable in a way that "here is my paragraph" is not.
 *
 * Two rules, and the first is the one that matters:
 *
 * **The composed question is visible and editable.** It goes into the URL, the
 * Ask Sahayak box is seeded from the URL, and the reader sees the exact words
 * before pressing Ask. Nothing is carried invisibly. A hidden prefix would mean
 * being answered on something you were never shown, which is the same defect as
 * a hidden system prompt — and this product's whole claim is that you can check
 * what it did.
 *
 * **It states, it does not conclude.** The question describes the product and
 * asks what applies. It never asserts the classification the analyst was unable
 * to settle, and it never says the formulation is novel — the analyst refuses
 * that verdict, so a question generated from it must not smuggle one in.
 */

/** Longest question worth sending. Past this, retrieval is matching noise. */
const MAX_LENGTH = 1200;

function percent(value: number | null, derived: number | null): string {
  const share = value ?? derived;
  return share === null ? '' : ` (${share}%)`;
}

export function questionFromAnalysis(conversation: Conversation): string | null {
  const { invention, analysis } = conversation;
  const named = invention.ingredients.filter((one) => one.name.trim());
  if (named.length === 0) return null;

  const parts: string[] = [];

  // The form is stored as a key — `face_pack`, `oral_formulation` — and the
  // category beside it is a single word like `skin`. Joined raw they produced
  // "an Ayurvedic face_pack skin", which reads as machine output and tells the
  // reader their own product was not understood. The form alone, with its
  // underscores opened out, is the plain phrase a person would use; the
  // category is dropped here because it adds nothing a form has not said.
  const what = (invention.form ?? invention.category ?? '').replace(/_/g, ' ').trim();
  parts.push(
    what
      ? `We have developed an Ayurvedic ${what}${invention.title ? ` (${invention.title})` : ''}.`
      : `We have developed an Ayurvedic product${invention.title ? ` (${invention.title})` : ''}.`,
  );

  const composition = named
    .slice(0, 12)
    .map((one) => `${one.name}${percent(one.percent, one.percent_derived)}`)
    .join(', ');
  parts.push(`It contains ${composition}.`);

  if (invention.intended_use) parts.push(`It is intended for ${invention.intended_use}.`);

  // Distinctive features are the reader's own claim about their product, and
  // they are what a patent question turns on. Carried as stated, never as
  // established: "we believe" survives into the question.
  if (invention.distinctive_features.length > 0) {
    parts.push(`We believe what is distinctive is: ${invention.distinctive_features.join('; ')}.`);
  }

  // What the analyst could not settle becomes part of the question rather than
  // being dropped. An open classification is the commonest reason an answer
  // turns out not to apply.
  const open = analysis?.assessment.would_sharpen ?? [];
  if (open.length > 0) {
    parts.push(`We do not yet know: ${open.slice(0, 3).join('; ')}.`);
  }

  parts.push(
    'What intellectual-property and regulatory requirements apply to this in India, ' +
      'and in what order should we deal with them?',
  );

  const question = parts.join(' ').replace(/\s+/g, ' ').trim();
  return question.length > MAX_LENGTH ? `${question.slice(0, MAX_LENGTH - 1).trimEnd()}…` : question;
}

export function askUrlFromAnalysis(conversation: Conversation): string | null {
  const question = questionFromAnalysis(conversation);
  return question === null ? null : `/sahayak?q=${encodeURIComponent(question)}`;
}
