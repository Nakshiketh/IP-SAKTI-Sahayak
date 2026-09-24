import { useTranslation } from 'react-i18next';

import { ClaimText } from '@/components/answer/ClaimText';
import { cn } from '@/lib/cn';
import { summarise } from '@/lib/inShort';
import type { Answer } from '@/types/domain';

/**
 * The answer in sixty words, and what follows from it.
 *
 * The rule that shapes this: it is a *selection*, never a paraphrase. Every
 * sentence here is a claim the composer already built from a retrieved passage,
 * shown with its citation intact. Rewriting the answer into plainer words would
 * produce text no source says, which is the one thing this product does not do
 * — and it would do it in the most prominent position on the page, where it
 * would be trusted most and checked least.
 *
 * So "in short" takes whole claims from the answer block until it reaches sixty
 * words, and stops. Where that is the entire answer, this section is redundant
 * and is not rendered at all.
 *
 * "What this means for you" is the what-to-check block, which the composer
 * already writes as things to do. Bullets rather than prose, because that is
 * what a list of actions is.
 */

/** At most five, because a list of actions longer than that is not a list. */
const MAX_BULLETS = 5;

export function InShort({
  answer,
  numbering,
  onCitationSelect,
  className,
}: {
  answer: Answer;
  numbering: ReadonlyMap<string, number>;
  onCitationSelect?: (citationId: string) => void;
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const { claims, truncated } = summarise(answer);
  const actions = answer.blocks.find((block) => block.kind === 'what_to_check');

  // Nothing was left out, so a summary would repeat the answer word for word.
  if (claims.length === 0 || !truncated) return null;

  return (
    <section aria-labelledby="in-short-heading" className={className}>
      <h3 id="in-short-heading" className="text-xs uppercase tracking-wide text-muted">
        {t('inShort.heading')}
      </h3>
      <p className={cn('mt-1.5 text-md')}>
        {claims.map((claim, index) => (
          <span key={claim.text.slice(0, 40) + String(index)}>
            {index > 0 ? ' ' : ''}
            <ClaimText
              claim={claim}
              numbering={numbering}
              citations={answer.citations}
              {...(onCitationSelect ? { onCitationSelect } : {})}
            />
          </span>
        ))}
      </p>

      {actions && actions.claims.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs uppercase tracking-wide text-muted">{t('inShort.meansForYou')}</h3>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {actions.claims.slice(0, MAX_BULLETS).map((claim, index) => (
              <li key={claim.text.slice(0, 40) + String(index)} className="flex gap-2">
                <span aria-hidden="true" className="text-muted">
                  —
                </span>
                <span>
                  <ClaimText
                    claim={claim}
                    numbering={numbering}
                    citations={answer.citations}
                    {...(onCitationSelect ? { onCitationSelect } : {})}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
