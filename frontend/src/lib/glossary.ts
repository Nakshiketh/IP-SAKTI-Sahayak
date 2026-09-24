import glossary from '../../../data/glossary/en.json';

/**
 * The glossary, and finding which of its terms a piece of text actually uses.
 *
 * The data file is the single copy, shared with the backend and with the tests
 * that check every `source_id` against the corpus. It is imported rather than
 * fetched because it is small, it never changes between deploys, and a
 * definition that arrived after the text it explains would be useless.
 *
 * Matching is whole-word and case-insensitive, with one exception worth
 * stating: an all-capitals abbreviation like ABS or NBA is matched
 * case-sensitively. Lower-cased, "abs" appears inside ordinary words and "nba"
 * is not what anyone meant, and a glossary that fires on the wrong word teaches
 * a reader to ignore it.
 */

export interface GlossaryTerm {
  term: string;
  expansion: string | null;
  plain_definition: string;
  source_id: string | null;
}

export const TERMS: GlossaryTerm[] = (glossary as { terms: GlossaryTerm[] }).terms;

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matcher(term: string): RegExp {
  const abbreviation = term.length <= 5 && term === term.toUpperCase();
  return new RegExp(`\\b${escape(term)}\\b`, abbreviation ? '' : 'i');
}

/** The glossary terms this text uses, in the order the glossary lists them. */
export function termsIn(text: string): GlossaryTerm[] {
  if (!text.trim()) return [];
  return TERMS.filter((entry) => matcher(entry.term).test(text));
}
