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
export function QueryFailure({
  code,
  onRetry,
  onShorten,
}: {
  code: QueryErrorCode;
  onRetry: () => void;
  /** Offered only where a shorter question would actually help. */
  onShorten?: () => void;
}) {
  const { t } = useTranslation('sahayak');

  return (
    <section className="mt-6" data-failed="true" data-error-code={code}>
      <Callout tone="caution" title={t('error.title')} titleLevel={2}>
        {t(`error.${code}`)}
      </Callout>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('error.retry')}
        </Button>
        {/* A timeout is the one failure a reader can do something about
            themselves, so the action that helps is offered beside the retry. */}
        {code === 'timeout' && onShorten ? (
          <Button variant="secondary" size="sm" onClick={onShorten}>
            {t('error.shorter')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
