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
 * Three rules, and the first is the one that matters:
 *
 * **The composed question is visible and editable.** It goes into the URL, and
 * Ask Sahayak shows the exact words under "You asked", where the reader can
 * edit and ask again. Nothing is carried invisibly. A hidden prefix would mean
 * being answered on something you were never shown, which is the same defect as
 * a hidden system prompt — and this product's whole claim is that you can check
 * what it did.
 *
 * **It states, it does not conclude.** The question describes the product and
 * asks what applies. It never asserts the classification the analyst was unable
 * to settle, and it never says the formulation is novel — the analyst refuses
 * that verdict, so a question generated from it must not smuggle one in.
 *
 * **The product is context; the questions are numbered.** The sources speak of
 * "known Ayush ingredients" and "biological resources", never of neem at 15%.
 * Asked as one paragraph, every ingredient name and percentage counted against
 * every passage and nothing cleared the retrieval floor — the neem face pack
 * came back unanswered. `backend/app/services/parts.py` treats the text before
 * a numbered list as context it shows but never searches, and retrieves for
 * each numbered question on its own. So the product goes in the stem, and each
 * question is put in the words the sources use.
 */

/** Longest question worth sending. Past this, retrieval is matching noise. */
const MAX_LENGTH = 1200;

/** The analyst's open points are stored as keys; these are the words for them. */
const OPEN_POINTS: Record<string, string> = {
  purpose: 'what each ingredient does',
  process: 'how it is prepared',
  novelty: 'what is new about it',
  problem: 'the problem it solves',
  evidence: 'test results',
  disclosure: 'whether it has been made public',
  brand: 'a brand name',
  percent_total: 'percentages that add up to 100',
};

function percent(value: number | null, derived: number | null): string {
  const share = value ?? derived;
  return share === null ? '' : ` (${share}%)`;
}

/** Trailing full stops come off, so "pimples." does not become "pimples..". */
function phrase(text: string): string {
  return text.trim().replace(/[.\s]+$/, '');
}

function numberedQuestions(conversation: Conversation, count: number): string[] {
  const { invention } = conversation;
  const questions = [
    count > 1
      ? 'Is a combination of known Ayush ingredients patentable in India?'
      : 'Is a product made from a known Ayush ingredient patentable in India?',
    'Could the formulation be excluded as traditional knowledge, and how do we search TKDL for prior art?',
  ];
  // Only while nothing has been tested: once results exist, the reader is past
  // asking what an examiner expects.
  if (count > 1 && !invention.evidence) {
    questions.push('What evidence of synergy or enhanced effect does an examiner expect for a combination?');
  }
  questions.push(
    'Do we need National Biodiversity Authority approval before filing a patent on an invention using Indian biological resources?',
  );
  // Once it is public there is nothing left to keep confidential.
  if (invention.disclosure !== 'public') {
    questions.push('How do we keep the formulation confidential before filing?');
  }
  questions.push(
    'How do we register our brand name as a trade mark?',
    'Which regulatory category does it fall in, and what licence is needed to manufacture and sell it?',
  );
  return questions;
}

export function questionFromAnalysis(conversation: Conversation): string | null {
  const { invention, analysis } = conversation;
  const named = invention.ingredients.filter((one) => one.name.trim());
  if (named.length === 0) return null;

  const context: string[] = [];

  // The form is stored as a key — `face_pack`, `oral_formulation` — and the
  // category beside it is a single word like `skin`. Joined raw they produced
  // "an Ayurvedic face_pack skin", which reads as machine output and tells the
  // reader their own product was not understood. The form alone, with its
  // underscores opened out, is the plain phrase a person would use; the
  // category is dropped here because it adds nothing a form has not said.
  const what = (invention.form ?? invention.category ?? '').replace(/_/g, ' ').trim();
  context.push(
    what
      ? `We have developed an Ayurvedic ${what}${invention.title ? ` (${invention.title})` : ''}.`
      : `We have developed an Ayurvedic product${invention.title ? ` (${invention.title})` : ''}.`,
  );

  const composition = named
    .slice(0, 12)
    .map((one) => `${one.name}${percent(one.percent, one.percent_derived)}`)
    .join(', ');
  context.push(`It contains ${composition}.`);

  // The intended use is kept as the reader wrote it. Wrapped in "It is intended
  // for …" it read "It is intended for I developed a herbal face pack for…",
  // because the analyst stores the reader's whole sentence.
  if (invention.intended_use) {
    context.push(`What it is for, in our words: ${phrase(invention.intended_use)}.`);
  }

  // Distinctive features are the reader's own claim about their product, and
  // they are what a patent question turns on. Carried as stated, never as
  // established: "we believe" survives into the question.
  if (invention.distinctive_features.length > 0) {
    context.push(`We believe what is distinctive is: ${invention.distinctive_features.join('; ')}.`);
  }

  // What the analyst could not settle is said rather than dropped. An open
  // classification is the commonest reason an answer turns out not to apply.
  const open = (analysis?.assessment.would_sharpen ?? []).map((point) => OPEN_POINTS[point] ?? point);
  if (open.length > 0) {
    context.push(`We do not yet know ${open.slice(0, 3).join('; ')}.`);
  }

  const questions = numberedQuestions(conversation, named.length)
    .map((question, index) => `${index + 1}. ${question}`)
    .join('\n');
  const tail = `\n\nWhat intellectual-property and regulatory requirements apply to this in India? In order:\n${questions}`;

  // The questions are what gets answered, so a long composition is what gives
  // way to the length limit — never a question.
  let stem = context.join(' ').replace(/\s+/g, ' ').trim();
  const room = MAX_LENGTH - tail.length;
  if (stem.length > room) stem = `${stem.slice(0, room - 1).trimEnd()}…`;
  return stem + tail;
}

export function askUrlFromAnalysis(conversation: Conversation): string | null {
  const question = questionFromAnalysis(conversation);
  return question === null ? null : `/sahayak?q=${encodeURIComponent(question)}`;
}
