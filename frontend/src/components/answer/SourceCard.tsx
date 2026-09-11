import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Heading, type HeadingLevel } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DemoCitation } from '@/services/answers.mock';
import type { Citation } from '@/types/domain';

/**
 * A passage an answer rests on.
 *
 * Three visual states, and the difference between them is the point:
 *
 *   verified    an indigo left rule. This came from a document we fetched.
 *   unverified  a neutral rule. Ingested, but not yet checked against the source.
 *   demo        a dashed border and the word "demo", in muted neutral, with no
 *               indigo anywhere. Demo content must never be able to pass for a
 *               verified source at a glance — that is why it does not merely get
 *               a smaller badge, it gets a different edge.
 */
interface SourceCardProps {
  citation: Citation | DemoCitation;
  number: number;
  /**
   * The passage this citation points at. Supplied by the query result, which
   * carries the text of every passage its answer rests on. Where it is absent
   * the card falls back to a fixture citation that carries its own — the static
   * example pages render citations with no query behind them.
   */
  passage?: string;
  active?: boolean;
  id?: string;
  /** Set from where the card sits in the document outline. */
  titleLevel?: HeadingLevel;
  className?: string;
}

function hasPassage(citation: Citation | DemoCitation): citation is DemoCitation {
  return 'passage' in citation && typeof citation.passage === 'string';
}

export function SourceCard({
  citation,
  number,
  passage,
  active = false,
  id,
  titleLevel = 4,
  className,
}: SourceCardProps) {
  const { t } = useTranslation('common');
  const [showPassage, setShowPassage] = useState(false);
  const isDemo = citation.verification_status === 'demo';
  const isVerified = citation.verification_status === 'verified';
  const passageText = passage ?? (hasPassage(citation) ? citation.passage : null);

  return (
    <article
      id={id}
      className={cn(
        'bg-surface p-3 rounded-data',
        isDemo
          ? 'border border-dashed border-rule-strong'
          : isVerified
            ? 'border-l-2 border-stamp'
            : 'border-l-2 border-rule-strong',
        active && 'bg-stamp/[0.06]',
        className,
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted">{t('answer.sourceNumber', { number })}</span>
        {isVerified ? <Badge tone="sourced">{t('answer.verifiedBadge')}</Badge> : null}
      </div>

      <Heading level={titleLevel} className="mt-1 text-base">
        {citation.document_title}
      </Heading>
      <p className="mt-0.5 max-w-none text-xs text-muted">{citation.organization}</p>

      {citation.section_label ? (
        <p className="mt-2 max-w-none text-xs text-muted">{citation.section_label}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {passageText ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setShowPassage((open) => !open)}
            aria-expanded={showPassage}
          >
            {showPassage ? t('answer.hidePassage') : t('answer.showPassage')}
          </Button>
        ) : null}
        {citation.url ? (
          <a
            href={citation.url}
            className="rounded-data text-xs text-stamp underline underline-offset-4"
            rel="noreferrer"
          >
            {t('answer.openSource')}
          </a>
        ) : (
          <span className="text-xs text-muted">{t('answer.openSourceUnavailable')}</span>
        )}
      </div>

      {passageText && showPassage ? (
        <p className="mt-3 border-l border-dashed border-rule-strong pl-3 text-xs text-muted">
          {passageText}
        </p>
      ) : null}
    </article>
  );
}
