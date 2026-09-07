import type { Answer } from '@/types/domain';

/**
 * An answer as plain text, with its citations intact.
 *
 * Someone pasting this into an email or a case file must not end up with an
 * uncited paragraph — that is how a sourced answer turns into an unsourced
 * assertion two hops later. So every claim keeps its marker, and the numbered
 * sources are appended with the document and section behind them.
 */
export function answerToText(
  answer: Answer,
  labels: {
    question: string;
    blocks: Record<string, string>;
    confidence: string;
    sources: string;
    notLegalAdvice: string;
    demo?: string;
  },
): string {
  const numbering = new Map(
    answer.citations.map((citation, index) => [citation.citation_id, index + 1]),
  );

  const lines: string[] = [labels.question, ''];

  for (const block of answer.blocks) {
    lines.push(labels.blocks[block.kind] ?? block.kind);
    const body =
      block.claims.length > 0
        ? block.claims
            .map((claim) => {
              const marks = claim.citation_ids
                .map((id) => numbering.get(id))
                .filter((n): n is number => n !== undefined);
              return marks.length > 0 ? `${claim.text} [${marks.join(', ')}]` : claim.text;
            })
            .join(' ')
        : block.text;
    lines.push(body, '');
  }

  lines.push(labels.confidence, '');
  lines.push(labels.sources);
  answer.citations.forEach((citation, index) => {
    const where = citation.section_label ? ` — ${citation.section_label}` : '';
    const status =
      citation.verification_status === 'demo' && labels.demo ? ` (${labels.demo})` : '';
    lines.push(
      `[${index + 1}] ${citation.document_title}, ${citation.organization}${where}${status}`,
    );
  });

  lines.push('', labels.notLegalAdvice);
  return lines.join('\n');
}
