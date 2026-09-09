import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { buttonStyles } from '@/components/ui';

/**
 * What a reader sees when the interface has broken.
 *
 * In its own file because `ErrorBoundary` has to be a class — React offers no
 * hook for catching a render error — and a file mixing a class with function
 * components cannot be fast-refreshed. This is the half worth editing with the
 * page in front of you, so it is the half that keeps its hot reload.
 */
export function BoundaryMessage({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('common');

  return (
    <div className="mx-auto max-w-[75rem] px-5 py-12" role="alert">
      <h1 className="text-2xl">{t('boundary.title')}</h1>
      <p className="mt-3 max-w-measure text-md text-muted">{t('boundary.body')}</p>
      {/* Said plainly, because the alternative reading is much worse: a reader
          who cannot tell a broken page from a refused answer will assume the
          product declined to tell them something. */}
      <p className="mt-3 max-w-measure text-base text-muted">{t('boundary.notAnAbstention')}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onRetry} className={buttonStyles({ variant: 'secondary' })}>
          {t('boundary.retry')}
        </button>
        <Link to="/" className={buttonStyles({ variant: 'quiet' })}>
          {t('notFound.action')}
        </Link>
      </div>
    </div>
  );
}
