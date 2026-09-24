import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * Six branches, and where each one stands.
 *
 * The four states matter more than the six rights. "Not indicated" means the
 * facts rule it out; "needs more information" means nobody has asked yet. A map
 * that showed one grey chip for both would tell someone they have no trade mark
 * position when the truth is that they never mentioned a name — and that is the
 * kind of quiet wrong answer that costs a right.
 *
 * Tapping a branch opens why, the sources, the facts that would settle it and
 * one next step. Collapsed by default: six expanded panels is a wall, and the
 * chips alone answer the question most readers arrived with.
 */

export interface ProtectionEntry {
  right: string;
  relevance: string;
  reason_keys: string[];
  facts_required: { key: string; question: string }[];
  source_ids: string[];
  next_step_key: string | null;
}

const TONE: Record<string, 'sourced' | 'caution' | 'neutral'> = {
  relevant: 'sourced',
  possibly_relevant: 'neutral',
  needs_more_information: 'caution',
  not_indicated: 'neutral',
};

export function ProtectionMap({
  entries,
  className,
}: {
  entries: ProtectionEntry[];
  className?: string;
}) {
  const { t } = useTranslation('sahayak');
  const [open, setOpen] = useState<string | null>(null);
  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="protection-map-heading" className={className}>
      <h3 id="protection-map-heading" className="text-md">
        {t('protection.heading')}
      </h3>
      <p className="mt-1 max-w-measure text-sm text-muted">{t('protection.standfirst')}</p>

      <ul className="mt-3 space-y-2">
        {entries.map((entry) => {
          const expanded = open === entry.right;
          return (
            <li key={entry.right} className="rounded-card border border-rule bg-surface">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : entry.right)}
                className={cn(
                  'flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left',
                  'text-sm hover:bg-surface-sunk',
                )}
              >
                <span>{t(`protection.right.${entry.right}`, entry.right)}</span>
                <Badge tone={TONE[entry.relevance] ?? 'neutral'}>
                  {t(`protection.relevance.${entry.relevance}`, entry.relevance)}
                </Badge>
              </button>

              {expanded ? (
                <div className="border-t border-rule px-3 py-3 text-sm">
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs text-muted">{t('protection.whyHeading')}</dt>
                      <dd className="mt-0.5">
                        <ul className="space-y-0.5">
                          {entry.reason_keys.map((key) => (
                            <li key={key}>{t(`protection.reason.${key}`, key)}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>

                    {entry.facts_required.length > 0 ? (
                      <div>
                        <dt className="text-xs text-muted">{t('protection.factsHeading')}</dt>
                        <dd className="mt-0.5">
                          <ul className="space-y-0.5">
                            {entry.facts_required.map((fact) => (
                              <li key={fact.key}>{fact.question}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}

                    {entry.source_ids.length > 0 ? (
                      <div>
                        <dt className="text-xs text-muted">{t('protection.sourcesHeading')}</dt>
                        <dd className="mt-0.5 text-muted">{entry.source_ids.join(', ')}</dd>
                      </div>
                    ) : null}

                    {entry.next_step_key ? (
                      <div>
                        <dt className="text-xs text-muted">{t('protection.nextHeading')}</dt>
                        <dd className="mt-0.5">
                          {t(`protection.step.${entry.next_step_key}`, entry.next_step_key)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
