import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';

/**
 * What state a piece of the system is actually in.
 *
 * Three values, and the distinction between the middle one and the first is the
 * one that matters: `demo` means the code exists and runs, but on illustrative
 * data rather than on anything retrieved. Collapsing that into "running" is how
 * a page like this starts lying.
 */
export type BuildState = 'live' | 'demo' | 'planned';

export function StageStatus({ state }: { state: BuildState }) {
  const { t } = useTranslation('howitworks');
  return (
    <Badge tone={state === 'live' ? 'sourced' : state === 'demo' ? 'neutral' : 'caution'}>
      {t(`status.${state}`)}
    </Badge>
  );
}
