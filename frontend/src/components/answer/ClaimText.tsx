import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import type { Citation, Claim } from '@/types/domain';

/**
 * One sentence, and what it rests on.
 *
 * Two states, and a reader should be able to tell them apart without reading a
 * legend. A sentence with citations carries a numbered marker per source. A
 * sentence without any is drawn with a dashed underline and says, when you reach
 * it, that it is general explanation rather than something retrieved.
 *
 * The unsourced sentence is focusable on purpose. A dashed underline is invisible
 * to a keyboard-only reader who cannot hover, and "which parts of this are
 * actually sourced" is the single most important thing this component conveys.
 */
interface ClaimTextProps {
  claim: Claim;
  /** Citation id -> its 1-based position in the answer's source list. */
  numbering: ReadonlyMap<string, number>;
  citations: readonly Citation[];
  activeCitationId?: string | null;
  onCitationSelect?: (citationId: string) => void;
}

export function ClaimText({
  claim,
  numbering,
  citations,
  activeCitationId,
  onCitationSelect,
}: ClaimTextProps) {
  const { t } = useTranslation('common');
  const noteId = useId();

  if (claim.citation_ids.length === 0) {
    return (
      <>
        <span
          tabIndex={0}
          aria-describedby={noteId}
          className="rounded-data underline decoration-dashed decoration-from-font underline-offset-4 decoration-ink/35"
        >
          {claim.text}
        </span>
        <span id={noteId} hidden>
          {t('answer.uncited')}
        </span>{' '}
      </>
    );
  }

  return (
    <>
      <span>{claim.text}</span>
      {claim.citation_ids.map((id) => {
        const number = numbering.get(id);
        const citation = citations.find((c) => c.citation_id === id);
        if (number === undefined || !citation) return null;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onCitationSelect?.(id)}
            aria-label={t('answer.citationMarker', {
              number,
              title: citation.document_title,
            })}
            className={cn(
              'ml-0.5 align-super text-[0.7em] font-medium text-stamp',
              'rounded-[2px] px-0.5 transition-colors duration-quick ease-incise',
              'hover:bg-stamp/10',
              activeCitationId === id && 'bg-stamp/15',
            )}
          >
            {number}
          </button>
        );
      })}{' '}
    </>
  );
}
