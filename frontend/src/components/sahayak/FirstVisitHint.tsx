import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

/**
 * Three hints, once, and never again once dismissed.
 *
 * Three is the whole budget for the product's life, not three per screen. A
 * fourth would be a tour, and a tour is what a product builds when it cannot
 * make the thing itself legible.
 *
 * Each hint is shown at the moment it is useful rather than all at once on
 * arrival: where to start when there is nothing on screen, what the escalation
 * level means when the first one appears, how to open a source when there are
 * sources to open.
 *
 * Dismissal is stored per hint in localStorage, which is a preference and
 * nothing else. Storage refused means the hint shows again, which is a smaller
 * failure than an error path for something this minor.
 */

export type HintId = 'start' | 'escalation' | 'sources';

const KEY = 'sahayak.hints.dismissed';

function dismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function remember(id: HintId): void {
  try {
    const all = dismissed();
    all.add(id);
    localStorage.setItem(KEY, JSON.stringify([...all]));
  } catch {
    // The hint stays dismissed for this session, which is enough.
  }
}

export function FirstVisitHint({ id, className }: { id: HintId; className?: string }) {
  const { t } = useTranslation('sahayak');
  // Hidden until the stored state is read, so a returning reader never sees a
  // hint flash before it is dismissed.
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!dismissed().has(id));
  }, [id]);

  if (!show) return null;

  return (
    <aside
      className={cn(
        'rounded-card border border-rule bg-surface-sunk p-3 text-sm',
        'flex flex-wrap items-start justify-between gap-3',
        className,
      )}
    >
      <div>
        <p>{t(`hints.${id}.title`)}</p>
        <p className="mt-0.5 text-muted">{t(`hints.${id}.body`)}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          remember(id);
          setShow(false);
        }}
        className="min-h-[44px] shrink-0 px-2 text-sm underline"
      >
        {t('hints.dismiss')}
      </button>
    </aside>
  );
}
