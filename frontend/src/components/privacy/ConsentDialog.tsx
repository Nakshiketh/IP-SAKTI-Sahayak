import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { recordConsent, type CredentialedSource } from '@/services/privacy';

/**
 * Asking before anything goes out under the reader's own credentials.
 *
 * Four things this has to do, and each is a separate line rather than a
 * paragraph somebody skims:
 *
 *   1. Name the source. Not "a subscription source" — the title and who
 *      publishes it, because a reader cannot agree to a category.
 *   2. Say whose credentials are used, and that this product never sees them.
 *   3. Say how far the agreement reaches: this source, this session, no further.
 *   4. Say that the decision is written down, and where the reader can see it.
 *
 * There is no default. Nothing is pre-selected, the dialog cannot be dismissed
 * into a grant, and closing it is a refusal — a consent that could be given by
 * not reading carefully is not consent.
 */
interface ConsentDialogProps {
  source: CredentialedSource;
  open: boolean;
  onClose: () => void;
  /** Called after the server has recorded it, never before. */
  onRecorded: () => void;
}

export function ConsentDialog({ source, open, onClose, onRecorded }: ConsentDialogProps) {
  const { t } = useTranslation('privacy');
  const { t: tc } = useTranslation('common');
  const panel = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useFocusTrap(panel, open, onClose);

  if (!open) return null;

  const name = source.short_title ?? source.title;

  async function grant() {
    setBusy(true);
    setFailed(false);
    try {
      await recordConsent(source.document_id, true);
      onRecorded();
      onClose();
    } catch {
      // Never optimistic. If the server did not record it, nothing has been
      // agreed to, and saying otherwise would put a grant in the reader's
      // access log that the log does not contain.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/35" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        tabIndex={-1}
        className="relative w-[min(34rem,100%)] max-h-full overflow-y-auto border border-rule-strong bg-bone p-5 sm:rounded-data"
      >
        <h2 id="consent-title" className="text-md">
          {t('consent.dialogTitle', { source: name })}
        </h2>

        <p className="mt-3 max-w-none text-base">
          {t('consent.dialogBody', { source: name, organization: source.organization })}
        </p>
        <ul className="m-0 mt-3 list-none space-y-2 p-0 text-base text-muted">
          <li className="border-l-2 border-rule-strong pl-3">{t('consent.dialogHolds')}</li>
          <li className="border-l-2 border-rule-strong pl-3">
            {t('consent.dialogScope', { source: name })}
          </li>
          <li className="border-l-2 border-rule-strong pl-3">{t('consent.dialogLogged')}</li>
        </ul>

        {failed ? (
          <p role="alert" className="mt-4 max-w-none text-base text-lac">
            {t('consent.failed')}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => void grant()} disabled={busy}>
            {t('consent.grant', { source: name })}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('consent.cancel')}
          </Button>
        </div>
        <p className="mt-3 max-w-none text-xs text-muted">{tc('footer.disclaimer')}</p>
      </div>
    </div>
  );
}
