import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FormError, OtpInput } from '@/components/portal/controls';
import { primaryButton, textLink } from '@/components/portal/styles';
import { authMessage } from '@/lib/authCopy';
import { AuthError, resendCode } from '@/services/auth';

/**
 * The emailed code: six boxes, a resend countdown, and the server's own words
 * for every refusal (attempts left, expired, locked).
 *
 * The code submits by itself when the sixth digit lands. Once a code can no
 * longer work (locked, or the challenge expired) the boxes are disabled and the
 * step offers the way back instead.
 */

const DEAD_ENDS = new Set(['OTP_LOCKED', 'CHALLENGE_EXPIRED']);

export function CodeEntry({
  challengeId,
  resendAvailableAt,
  intro,
  onSubmit,
  onRestart,
  restartLabel,
  onAnnounce,
}: {
  challengeId: string;
  /** Unix seconds. */
  resendAvailableAt: number;
  /** Where the code went, or (for a reset) that a code may have gone. */
  intro: string;
  onSubmit: (code: string) => Promise<void>;
  onRestart: () => void;
  restartLabel: string;
  onAnnounce: (message: string) => void;
}) {
  const { t } = useTranslation('common');
  const labelId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deadEnd, setDeadEnd] = useState(false);
  const [pending, setPending] = useState(false);
  const [resendAt, setResendAt] = useState(resendAvailableAt);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const wait = Math.max(0, Math.ceil(resendAt - now));

  async function submit(value: string) {
    if (pending || deadEnd || value.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (failure) {
      const message = authMessage(failure, t);
      setError(message);
      onAnnounce(message);
      if (failure instanceof AuthError && DEAD_ENDS.has(failure.code)) setDeadEnd(true);
      setCode('');
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      setResendAt(await resendCode(challengeId));
      setDeadEnd(false);
      setCode('');
      onAnnounce(t('auth.code.resent'));
    } catch (failure) {
      setError(authMessage(failure, t));
    }
  }

  return (
    <div>
      <p className="text-[16px] text-white/[0.86]">{intro}</p>

      <form
        noValidate
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(code);
        }}
      >
        <p id={labelId} className="text-[14px] font-medium text-white">
          {t('auth.code.label')}
        </p>
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError(null);
          }}
          onComplete={(value) => void submit(value)}
          disabled={pending || deadEnd}
          labelId={labelId}
          invalid={Boolean(error)}
        />
        <FormError message={error} />

        {deadEnd ? (
          <button type="button" onClick={onRestart} className={primaryButton}>
            {restartLabel}
          </button>
        ) : (
          <button type="submit" disabled={pending || code.length !== 6} className={primaryButton}>
            {pending ? t('auth.code.checking') : t('auth.code.verify')}
          </button>
        )}
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {wait > 0 ? (
          <span className="text-[14px] tabular-nums text-white/[0.78]">
            {t('auth.code.resendIn', {
              time: `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`,
            })}
          </span>
        ) : (
          <button type="button" onClick={() => void resend()} className={textLink}>
            {t('auth.code.resend')}
          </button>
        )}
        {!deadEnd ? (
          <button type="button" onClick={onRestart} className={textLink}>
            {restartLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
