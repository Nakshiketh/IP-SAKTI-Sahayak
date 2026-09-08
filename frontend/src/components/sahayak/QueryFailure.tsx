import { useTranslation } from 'react-i18next';

import { Button, Callout } from '@/components/ui';
import type { QueryErrorCode } from '@/services/query';

/**
 * The system failing, which is not the system abstaining.
 *
 * An abstention is the product working: it searched, it judged the evidence too
 * thin, and it says so with a reason the reader can act on. This is the product
 * not working — nothing was reached, or nothing was configured to answer. They
 * look different on purpose, and this one offers a retry rather than a rephrase,
 * because rephrasing a question fixes nothing here.
 *
 * Each message states what happened and what to do next, and none of them
 * implies an answer was withheld.
 */
export function QueryFailure({ code, onRetry }: { code: QueryErrorCode; onRetry: () => void }) {
  const { t } = useTranslation('sahayak');

  return (
    <section className="mt-6" data-failed="true" data-error-code={code}>
      <Callout tone="caution" title={t('error.title')} titleLevel={2}>
        {t(`error.${code}`)}
      </Callout>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
        {t('error.retry')}
      </Button>
    </section>
  );
}
