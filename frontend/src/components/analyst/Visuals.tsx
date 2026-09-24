import { CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import type { Analysis, Indicator } from '@/services/analyst';

/**
 * Three small pictures of the findings, each of a real number.
 *
 * None of them carries meaning by colour alone: the scale has a shape and a word
 * per position, the dots are counted in their label, and the summary strip is
 * text. None moves on its own.
 */

const ORDER: readonly Indicator[] = ['nothing_found_in_sources_searched', 'related_material_found', 'match_in_public_sources'];
const ICONS = {
  nothing_found_in_sources_searched: CircleCheck,
  related_material_found: CircleHelp,
  match_in_public_sources: TriangleAlert,
} as const;
const TONE: Record<Indicator, string> = {
  nothing_found_in_sources_searched: 'border-leaf text-leaf',
  related_material_found: 'border-ink text-ink',
  match_in_public_sources: 'border-lac text-lac',
};

/** The indicator's three positions, with the current one set in its colour. */
export function VerdictScale({ indicator }: { indicator: Indicator }) {
  const { t } = useTranslation('analyst');
  return (
    <div className="mt-4">
      <p className="text-xs text-muted">{t('scale.label')}</p>
      <ol className="m-0 mt-2 grid list-none grid-cols-3 gap-1.5 p-0">
        {ORDER.map((id) => {
          const Icon = ICONS[id];
          const current = id === indicator;
          return (
            <li
              key={id}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 border-t-4 px-1 pt-2 text-center text-xs leading-snug',
                current ? cn(TONE[id], 'font-medium') : 'border-rule text-muted',
              )}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(`indicator.${id}.label`)}</span>
              {current ? <span className="sr-only">({t('scale.current')})</span> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** One dot per ingredient of yours; filled where this product lists it too. */
export function SharedDots({ shared, total }: { shared: number; total: number }) {
  const { t } = useTranslation('analyst');
  return (
    <span
      role="img"
      aria-label={t('products.dotsLabel', { shared, total })}
      className="inline-flex flex-wrap items-center gap-1 align-middle"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            'h-2.5 w-2.5 rounded-seal border border-leaf',
            index < shared ? 'bg-leaf' : 'bg-transparent',
          )}
        />
      ))}
    </span>
  );
}

/** Four figures, each of which the tabs below explain. */
export function AtAGlance({ analysis, total }: { analysis: Analysis; total: number }) {
  const { t } = useTranslation('analyst');
  const prior = analysis.prior_art;
  const cells: [string, string][] = [
    [t('glance.indicator'), t(`indicator.${analysis.assessment.indicator}.label`)],
    [
      t('glance.products'),
      t('glance.productsValue', {
        count: analysis.products.matches.length,
        size: analysis.products.dataset_size,
      }),
    ],
    [
      t('glance.knowledge'),
      t('glance.knowledgeValue', { count: analysis.knowledge.traditional_count, total }),
    ],
    [
      t('glance.patents'),
      prior.state === 'searched'
        ? t('glance.patentsValue', { count: prior.matches.length, records: prior.record_count })
        : t('glance.patentsNone'),
    ],
  ];
  return (
    <dl
      aria-label={t('glance.label')}
      className="m-0 mt-4 grid grid-cols-2 gap-3 rounded-data border border-rule bg-surface p-3 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-rule-faint sm:p-0"
    >
      {cells.map(([label, value]) => (
        <div key={label} className="sm:px-3 sm:py-3">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="m-0 mt-1 font-display text-md leading-tight">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
