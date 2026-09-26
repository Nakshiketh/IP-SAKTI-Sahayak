import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthFormError, AuthSpinner } from '@/components/auth/AuthField';
import { authMessage } from '@/lib/authCopy';
import { cn } from '@/lib/cn';
import { AuthError, resendCode, type MemberCard } from '@/services/auth';

/**
 * The second step of a sign-in or a reset: the six-digit code from the email.
 *
 * Shows who the code is for (the member record, when a card was scanned), where
 * it was sent, and a resend countdown. The code submits by itself once six
 * digits are in. Every refusal is the server's own sentence: attempts left,
 * expired, locked.
 *
 * Phase 5 restyles this; the behaviour is the part that is meant to stay.
 */

/** Refusals after which this code can no longer work, so the step offers a restart. */
const DEAD_ENDS = new Set(['OTP_LOCKED', 'CHALLENGE_EXPIRED']);

export function CodeStep({
  challengeId,
  maskedEmail,
  member,
  resendAvailableAt,
  onSubmit,
  onRestart,
  restartLabel,
}: {
  challengeId: string;
  /** Absent for a reset, where saying where the code went would confirm a match. */
  maskedEmail?: string;
  member?: MemberCard;
  /** Unix seconds. */
  resendAvailableAt: number;
  onSubmit: (code: string) => Promise<void>;
  onRestart: () => void;
  restartLabel: string;
}) {
  const { t } = useTranslation('common');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deadEnd, setDeadEnd] = useState(false);
  const [pending, setPending] = useState(false);
  const [resendAt, setResendAt] = useState(resendAvailableAt);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const wait = Math.max(0, Math.ceil(resendAt - now));

  async function submit(value: string) {
    if (pending || deadEnd) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (failure) {
      setError(authMessage(failure, t));
      if (failure instanceof AuthError && DEAD_ENDS.has(failure.code)) setDeadEnd(true);
      setCode('');
    } finally {
      setPending(false);
    }
  }

  function change(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === 6) void submit(digits);
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      setResendAt(await resendCode(challengeId));
      setDeadEnd(false);
      setNotice(t('auth.code.resent'));
    } catch (failure) {
      setError(authMessage(failure, t));
    }
  }

  return (
    <div className="mt-2">
      {member ? (
        <>
          <p className="text-sm font-medium text-white">{t('auth.code.verified')}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[2px] border border-white/30 px-3 py-2 text-sm">
            <dt className="text-white/70">{t('auth.code.name')}</dt>
            <dd>{member.name}</dd>
            <dt className="text-white/70">{t('auth.code.role')}</dt>
            <dd>{member.role}</dd>
            <dt className="text-white/70">{t('auth.code.institution')}</dt>
            <dd>{member.institution}</dd>
            <dt className="text-white/70">{t('auth.code.memberId')}</dt>
            <dd className="tabular-nums">{member.memberId}</dd>
          </dl>
        </>
      ) : null}

      <h2 ref={headingRef} tabIndex={-1} className="mt-5 font-display text-lg focus:outline-none">
        {t('auth.code.title')}
      </h2>
      <p className="mt-1 text-sm text-white/80">
        {maskedEmail ? t('auth.code.sentTo', { email: maskedEmail }) : t('auth.code.sentReset')}
      </p>

      <form
        noValidate
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6) void submit(code);
        }}
      >
        <AuthFormError message={error} />
        <div>
          <label htmlFor="otp-code" className="block text-xs font-medium text-white/85">
            {t('auth.code.label')}
          </label>
          <input
            id="otp-code"
            name="one-time-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(event) => change(event.target.value)}
            disabled={pending || deadEnd}
            className="mt-1.5 h-11 w-full rounded-data border border-white/25 bg-black/25 px-3
              text-lg tracking-[0.4em] text-white tabular-nums placeholder:text-white/40
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70
              disabled:opacity-60"
          />
        </div>

        {deadEnd ? (
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex w-full items-center justify-center rounded-data bg-white px-4
              py-2.5 text-base font-medium text-[#0B120E] focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {restartLabel}
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending || code.length !== 6}
            className="inline-flex w-full items-center justify-center gap-2 rounded-data bg-white
              px-4 py-2.5 text-base font-medium text-[#0B120E] focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed
              disabled:opacity-60"
          >
            {pending ? <AuthSpinner /> : null}
            {pending ? t('auth.code.checking') : t('auth.code.verify')}
          </button>
        )}
      </form>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        {wait > 0 ? (
          <span className="tabular-nums text-white/70">
            {t('auth.code.resendIn', {
              time: `${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`,
            })}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            className="rounded-data text-white underline underline-offset-4
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {t('auth.code.resend')}
          </button>
        )}
        <button
          type="button"
          onClick={onRestart}
          className={cn(
            'rounded-data text-white/80 underline underline-offset-4',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          )}
        >
          {restartLabel}
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {pending ? t('auth.code.checking') : (notice ?? '')}
      </p>
    </div>
  );
}
