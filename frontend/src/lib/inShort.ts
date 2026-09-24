import type { Answer, Claim } from '@/types/domain';

/**
 * The opening of an answer, in sixty words or fewer.
 *
 * A selection, never a paraphrase: every sentence returned is a claim the
 * composer already built from a retrieved passage, and it keeps its citations.
 * Rewriting the answer into plainer words would produce text no source says, in
 * the most prominent position on the page — where it would be trusted most and
 * checked least.
 *
 * Lives apart from the component so the rule can be tested on its own, without
 * rendering anything.
 */

export const WORD_LIMIT = 60;

function wordsIn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function summarise(answer: Answer): { claims: Claim[]; truncated: boolean } {
  const block = answer.blocks.find((candidate) => candidate.kind === 'answer');
  if (!block) return { claims: [], truncated: false };

  const claims: Claim[] = [];
  let words = 0;
  for (const claim of block.claims) {
    const length = wordsIn(claim.text);
    // The first claim is taken whatever its length: an answer whose opening
    // sentence runs to seventy words should still have an opening sentence.
    if (claims.length > 0 && words + length > WORD_LIMIT) break;
    claims.push(claim);
    words += length;
  }
  return { claims, truncated: claims.length < block.claims.length };
}
