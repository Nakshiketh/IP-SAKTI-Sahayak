import { DEFAULT_LOCALE, type LocaleCode } from '@/i18n/languages';

/**
 * Which language a question is written in, decided by its script.
 *
 * This is script detection, not language identification, and the difference is
 * worth being precise about. Counting characters in Unicode blocks tells you
 * reliably that text is Telugu or Tamil or Bengali. It cannot tell you Hindi
 * from Marathi, because both are written in Devanagari — so where the script is
 * shared this reports the ambiguity rather than guessing, and the interface
 * shows a correction control either way.
 *
 * The full language-identification stage in the pipeline is Phase 10. This is
 * what can honestly be built now, and it covers the case that actually matters:
 * a reader typing in their own script should not have to tell the product what
 * they are typing in.
 */

interface ScriptRange {
  language: LocaleCode;
  /** Languages sharing this script that cannot be told apart by it. */
  sharedWith: LocaleCode[];
  start: number;
  end: number;
}

const SCRIPTS: readonly ScriptRange[] = [
  // Devanagari carries both Hindi and Marathi. The block cannot separate them.
  { language: 'hi', sharedWith: ['mr'], start: 0x0900, end: 0x097f },
  { language: 'bn', sharedWith: [], start: 0x0980, end: 0x09ff },
  { language: 'ta', sharedWith: [], start: 0x0b80, end: 0x0bff },
  { language: 'te', sharedWith: [], start: 0x0c00, end: 0x0c7f },
];

const LATIN = /\p{Script=Latin}/u;

export interface Detection {
  language: LocaleCode;
  /** Share of letters that fell in the winning script, 0 to 1. */
  confidence: number;
  /**
   * Languages this script is shared with. Non-empty means the script identified
   * the writing system but not the language, and the interface says so.
   */
  ambiguousWith: LocaleCode[];
  /** False when there was not enough text to say anything. */
  decided: boolean;
}

const UNDECIDED: Detection = {
  language: DEFAULT_LOCALE,
  confidence: 0,
  ambiguousWith: [],
  decided: false,
};

/** Minimum letters before a guess is worth showing at all. */
const MIN_LETTERS = 3;

export function detectScript(text: string): Detection {
  const trimmed = text.trim();
  if (trimmed.length === 0) return UNDECIDED;

  const counts = new Map<LocaleCode, number>();
  let latin = 0;
  let letters = 0;

  for (const character of trimmed) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;

    const script = SCRIPTS.find((range) => code >= range.start && code <= range.end);
    if (script) {
      counts.set(script.language, (counts.get(script.language) ?? 0) + 1);
      letters += 1;
      continue;
    }
    if (LATIN.test(character)) {
      latin += 1;
      letters += 1;
    }
  }

  if (letters < MIN_LETTERS) return UNDECIDED;

  let winner: LocaleCode = 'en';
  let best = latin;
  for (const [language, count] of counts) {
    if (count > best) {
      winner = language;
      best = count;
    }
  }

  const range = SCRIPTS.find((script) => script.language === winner);
  return {
    language: winner,
    confidence: best / letters,
    ambiguousWith: range?.sharedWith ?? [],
    decided: true,
  };
}
