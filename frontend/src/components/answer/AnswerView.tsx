import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ClaimText } from '@/components/answer/ClaimText';
import { SourceCard } from '@/components/answer/SourceCard';
import { Badge, ConfidenceMeter, Heading, type HeadingLevel } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Answer, AnswerBlockKind } from '@/types/domain';

/**
 * An answer, rendered.
 *
 * The block order is fixed and not configurable: answer, why this matters, what
 * to check, caveats. A reader who has seen one answer knows where to look in the
 * next one, and the caveats cannot be quietly dropped to make an answer read
 * more confidently.
 *
 * Phase 8 adds the retrieval status line, the abstention states, the related
 * records tab and escalation. This is the shape they attach to.
 */
const BLOCK_ORDER: readonly AnswerBlockKind[] = ['answer', 'why', 'what_to_check', 'caveat'];

interface AnswerViewProps {
  answer: Answer;
  /** One sentence saying why confidence is what it is. Never optional. */
  confidenceReason: string;
  headingLevel?: HeadingLevel;
  /**
   * Render the blocks only. The workspace positions sources itself — inline at
   * desktop width, in a drawer or a sheet below it — so it needs the answer
   * without the column.
   */
  hideSources?: boolean;
  className?: string;
}

export function AnswerView({
  answer,
  confidenceReason,
  headingLevel = 3,
  hideSources = false,
  className,
}: AnswerViewProps) {
  const { t } = useTranslation('common');
  const [activeCitationId, setActiveCitationId] = useState<string | null>(null);

  const numbering = useMemo(
    () => new Map(answer.citations.map((citation, index) => [citation.citation_id, index + 1])),
    [answer.citations],
  );

  const blocks = useMemo(
    () => BLOCK_ORDER.flatMap((kind) => answer.blocks.filter((block) => block.kind === kind)),
    [answer.blocks],
  );

  function selectCitation(citationId: string) {
    setActiveCitationId(citationId);
    // `scrollIntoView` is optional: jsdom does not implement it, and neither
    // do some embedded browsers. Following a marker still selects the card;
    // only the scroll is skipped.
    document
      .getElementById(`${answer.answer_id}-source-${citationId}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }

  return (
    <div
      data-answered="true"
      className={cn('grid gap-8', hideSources ? null : 'lg:grid-cols-[1fr_20rem]', className)}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2 border-b border-rule pb-3">
          <Badge>{t(`jurisdiction.${answer.jurisdiction}`)}</Badge>
          <Badge>{t(`productClass.${answer.product_class}`)}</Badge>
          <Badge>
            {answer.as_of_date
              ? t('answer.asOf', { date: answer.as_of_date })
              : t('answer.noSourceDate')}
          </Badge>
        </div>

        <ConfidenceMeter level={answer.confidence} reason={confidenceReason} className="mt-3" />

        <div className="mt-6 space-y-6">
          {blocks.map((block) => (
            <section key={block.id}>
              <Heading level={headingLevel} className="text-base text-muted">
                {t(`answer.blocks.${block.kind}`)}
              </Heading>
              <p className="mt-1.5 max-w-measure">
                {block.claims.length > 0
                  ? block.claims.map((claim, index) => (
                      <ClaimText
                        key={`${block.id}-${index}`}
                        claim={claim}
                        numbering={numbering}
                        citations={answer.citations}
                        activeCitationId={activeCitationId}
                        onCitationSelect={selectCitation}
                      />
                    ))
                  : block.text}
              </p>
            </section>
          ))}
        </div>

        {/*
          The provenance line. It sits after the answer rather than before it,
          in the register of a footnote, because it qualifies what was just read
          rather than warning someone off reading it: every source above links
          to its official document, and the official text is the authority.
        */}
        <p className="mt-8 max-w-measure border-t border-rule pt-3 text-xs text-muted">
          {t('answer.sourceNote')}
        </p>
      </div>

      {/*
        A plain div, not an <aside>. The source list belongs to this answer, not
        to the page, and a complementary landmark nested inside content is both
        wrong and reported by axe as landmark-complementary-is-top-level. The
        heading is what gives this region its structure.
      */}
      {hideSources ? null : (
        <div>
          <Heading level={headingLevel} className="text-base text-muted">
            {t('answer.sourcesHeading')}{' '}
            <span className="text-xs">
              {t('answer.sourceCount', { count: answer.citations.length })}
            </span>
          </Heading>
          <ul className="mt-3 m-0 list-none space-y-3 p-0">
            {answer.citations.map((citation, index) => (
              <li key={citation.citation_id}>
                <SourceCard
                  id={`${answer.answer_id}-source-${citation.citation_id}`}
                  citation={citation}
                  number={index + 1}
                  titleLevel={Math.min(headingLevel + 1, 6) as HeadingLevel}
                  active={activeCitationId === citation.citation_id}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
