import { useTranslation } from 'react-i18next';

import { Badge } from './Badge';

/**
 * What state a piece of the system is actually in.
 *
 * Three values, and the distinction between the middle one and the first is what
 * matters: `demo` means the code exists and runs, but on illustrative data rather
 * than on anything retrieved. Collapsing that into "running" is how a page starts
 * lying about itself.
 *
 * Lives in the design system rather than on one page, because more than one
 * surface has to state what is and is not built.
 */
export type BuildState = 'live' | 'demo' | 'planned';

export function BuildStateBadge({ state }: { state: BuildState }) {
  const { t } = useTranslation('common');
  return (
    <Badge tone={state === 'live' ? 'sourced' : state === 'demo' ? 'neutral' : 'caution'}>
      {t(`buildState.${state}`)}
    </Badge>
  );
}
