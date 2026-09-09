import { useTranslation } from 'react-i18next';

import { useOnline } from '@/hooks/useOnline';

/**
 * A standing line at the top of the page while there is no network.
 *
 * Not a toast and not a modal. A reader who has lost their connection has not
 * done anything wrong and does not need to dismiss anything; they need to know
 * why the next thing they try will fail, and to stop seeing it the moment the
 * connection returns. So it appears and disappears on its own and takes no
 * action away.
 *
 * It says what still works, because most of the page does. Telling a reader
 * they are offline without telling them they can still read the page they are
 * on invites them to close it.
 */
export function OfflineNotice() {
  const { t } = useTranslation('common');
  const online = useOnline();

  if (online) return null;

  return (
    <div
      role="status"
      className="border-b border-lac/40 bg-lac/[0.06] px-5 py-2.5 text-xs text-ink print:hidden"
    >
      <p className="mx-auto max-w-[75rem]">
        <strong className="font-medium">{t('offline.title')}</strong> {t('offline.body')}
      </p>
    </div>
  );
}
