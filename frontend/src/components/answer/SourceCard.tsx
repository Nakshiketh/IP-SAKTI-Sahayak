import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, Heading, type HeadingLevel } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Citation } from '@/types/domain';

/** A citation that carries its own passage text, as the static examples do. */
type CitationWithPassage = Citation & { passage: string };

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
  citation: Citation | CitationWithPassage;
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

/** The site a source lives on, so a reader can see it is the official one. */
/**
 * The host, but only for a link this product will actually offer.
 *
 * Citation URLs come from the verified corpus, which is in the repository, so
 * nothing hostile reaches here today. The check is here because that is a
 * property of the current corpus rather than of this component: a `javascript:`
 * URL rendered into an href is an XSS, and "the data is trusted" is the
 * assumption every such bug was built on.
 *
 * Returns null for anything that is not plain https, which also means the link
 * is not rendered at all.
 */
function sourceHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function hasPassage(citation: Citation | CitationWithPassage): citation is CitationWithPassage {
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
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs text-muted">{t('answer.sourceNumber', { number })}</span>
        {isVerified ? <Badge tone="sourced">{t('answer.verifiedBadge')}</Badge> : null}
        {/* Cited as a known official source that could not be re-fetched. */}
        {'provenance_pending' in citation && citation.provenance_pending ? (
          <Badge tone="caution">{t('answer.provenancePending')}</Badge>
        ) : null}
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
        {citation.url && sourceHost(citation.url) ? (
          <a
            href={citation.url}
            className="rounded-data text-xs text-stamp underline underline-offset-4"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('answer.openSource')}
            {sourceHost(citation.url) ? (
              <span className="text-muted no-underline"> · {sourceHost(citation.url)}</span>
            ) : null}
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
