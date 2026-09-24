import { useTranslation } from 'react-i18next';

import { Badge, Disclosure } from '@/components/ui';
import { termsIn, type GlossaryTerm } from '@/lib/glossary';
import type { Answer } from '@/types/domain';

/**
 * The jargon in this answer, explained.
 *
 * It reads the answer and offers a definition for each term it actually
 * contains, rather than listing a dictionary nobody asked for. A reader who
 * has just met "ABS" three times gets ABS; a reader who has not, does not.
 *
 * Deliberately beside the answer and not inside it. Annotating words within a
 * cited sentence would put this product's wording inside text that belongs to a
 * source, and the citation markers already occupy that space — two kinds of
 * underline in one sentence is one too many to tell apart.
 *
 * Every entry says where it stands. With a source it offers the document; with
 * none it is labelled a plain-language explainer, because a definition written
 * here is a reading aid and never the operative words.
 */

function Entry({ term }: { term: GlossaryTerm }) {
  const { t } = useTranslation('sahayak');
  return (
    <div className="border-b border-rule py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <dt className="text-sm">
          {term.term}
          {term.expansion ? <span className="text-muted"> — {term.expansion}</span> : null}
        </dt>
        {term.source_id ? null : <Badge tone="neutral">{t('glossary.explainer')}</Badge>}
      </div>
      <dd className="mt-0.5 text-sm text-muted">{term.plain_definition}</dd>
    </div>
  );
}

export function GlossaryNotes({ answer, className }: { answer: Answer; className?: string }) {
  const { t } = useTranslation('sahayak');
  const text = answer.blocks.map((block) => block.text).join(' ');
  const found = termsIn(text);
  if (found.length === 0) return null;

  return (
    <Disclosure
      summary={t('glossary.heading', { count: found.length })}
      {...(className ? { className } : {})}
    >
      <dl>
        {found.map((term) => (
          <Entry key={term.term} term={term} />
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">{t('glossary.explainerNote')}</p>
    </Disclosure>
  );
}
