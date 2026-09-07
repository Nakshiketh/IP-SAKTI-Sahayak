import { useTranslation } from 'react-i18next';

import { Chip, Disclosure } from '@/components/ui';

/**
 * Three questions, then the rest behind a disclosure.
 *
 * Ten chips in front of a first-time reader is a menu to be read, not an
 * invitation to start. Three is enough to show what kind of question this
 * answers; the rest are grouped by what someone is actually trying to do, for
 * the reader who wants to browse.
 */
export const STARTER_GROUPS = [
  { group: 'protecting', items: ['reformulated', 'brandName', 'gi', 'bioSource'] },
  { group: 'market', items: ['manufacturing', 'healthClaim', 'classification'] },
  { group: 'biological', items: ['wildCollect'] },
  { group: 'abroad', items: ['uk', 'multiCountry'] },
] as const;

/** The three shown before anything is revealed. */
export const FIRST_THREE = ['reformulated', 'manufacturing', 'uk'] as const;

interface StarterQuestionsProps {
  onPick: (question: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StarterQuestions({ onPick, open, onOpenChange }: StarterQuestionsProps) {
  const { t } = useTranslation('sahayak');

  return (
    <div>
      <p className="text-xs text-muted">{t('starters.heading')}</p>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
        {FIRST_THREE.map((key) => (
          <li key={key}>
            <Chip onClick={() => onPick(t(`starters.items.${key}`))}>
              {t(`starters.items.${key}`)}
            </Chip>
          </li>
        ))}
      </ul>

      <Disclosure
        className="mt-4"
        summary={t('starters.more')}
        open={open}
        onOpenChange={onOpenChange}
      >
        <div className="space-y-4 pt-2">
          {STARTER_GROUPS.map((group) => (
            <div key={group.group}>
              <p className="text-xs text-muted">{t(`starters.groups.${group.group}`)}</p>
              <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-2 p-0">
                {group.items.map((key) => (
                  <li key={key}>
                    <Chip onClick={() => onPick(t(`starters.items.${key}`))}>
                      {t(`starters.items.${key}`)}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}
