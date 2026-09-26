import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { AudioControl } from '@/components/auth/AudioControl';
import { AuthField, AuthFormError, AuthSpinner } from '@/components/auth/AuthField';
import { CodeStep } from '@/components/auth/CodeStep';
import { HeroVideo } from '@/components/auth/HeroVideo';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useHeroAudio } from '@/hooks/useHeroAudio';
import { authMessage, isPasswordErrorCode, PASSWORD_RULES as RULES } from '@/lib/authCopy';
import { cn } from '@/lib/cn';
import { AuthError, forgotPassword, resetPassword, verifyResetCode } from '@/services/auth';

/**
 * Forgot password: details, then the emailed code, then a new password.
 *
 * The first answer is the same whether or not the details matched a member,
 * and the code step does not say where a code was sent: doing either would
 * tell a stranger which Member IDs and emails belong together. A code that
 * never arrives simply never verifies.
 *
 * Same surface as the sign-in page; Phase 5 restyles all of these together.
 */

type Step =
  | { kind: 'details' }
  | { kind: 'code'; challengeId: string; resendAvailableAt: number }
  | { kind: 'password' };

export default function ForgotPassword() {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.forgotTitle'), t('auth.forgotBody'));
  const audio = useHeroAudio();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'details' });
  const [sent, setSent] = useState<string | null>(null);

  return (
    <>
      <HeroVideo videoRef={audio.videoRef} muted={audio.muted} />
      <div className="relative flex min-h-[100svh] flex-col text-white">
        <header className="px-5 py-5 sm:px-8">
          <span className="block font-display text-md">{t('brand.name')}</span>
          <span className="block text-xs text-white/75">{t('brand.descriptor')}</span>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <div
            className="w-full max-w-[26rem] rounded-data border border-white/25 bg-[#0B120E]/20 p-6
            shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.2)]
            backdrop-blur-[10px] backdrop-saturate-150 sm:p-8"
          >
            <h1 className="font-display text-xl tracking-tight">{t('auth.forgotTitle')}</h1>

            {step.kind === 'details' ? (
              <DetailsStep
                onSent={(challengeId, message) => {
                  setSent(message);
                  setStep({
                    kind: 'code',
                    challengeId,
                    resendAvailableAt: Date.now() / 1000 + 60,
                  });
                }}
              />
            ) : null}

            {step.kind === 'code' ? (
              <>
                {sent ? (
                  <p role="status" className="mt-3 text-sm text-white/85">
                    {sent}
                  </p>
                ) : null}
                <CodeStep
                  challengeId={step.challengeId}
                  resendAvailableAt={step.resendAvailableAt}
                  onSubmit={async (code) => {
                    await verifyResetCode(step.challengeId, code);
                    setStep({ kind: 'password' });
                  }}
                  onRestart={() => setStep({ kind: 'details' })}
                  restartLabel={t('auth.forgotStartAgain')}
                />
              </>
            ) : null}

            {step.kind === 'password' ? (
              <PasswordStep
                onDone={() => navigate('/login', { state: { notice: 'passwordUpdated' } })}
                onExpired={() => setStep({ kind: 'details' })}
              />
            ) : null}

            <p className="mt-6 border-t border-white/15 pt-5 text-center text-sm text-white/75">
              <Link
                to="/login"
                className="rounded-data text-white underline underline-offset-4
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {t('auth.backToLogin')}
              </Link>
            </p>
          </div>
        </main>

        <footer className="flex justify-end px-5 py-5 sm:px-8">
          <AudioControl {...audio} />
        </footer>
      </div>
    </>
  );
}

function DetailsStep({ onSent }: { onSent: (challengeId: string, message: string) => void }) {
  const { t } = useTranslation('common');
  const [values, setValues] = useState({ identifier: '', email: '' });
  const [errors, setErrors] = useState<{ identifier?: string; email?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (field: 'identifier' | 'email') => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (formError) setFormError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found: typeof errors = {};
    if (!values.identifier.trim()) found.identifier = t('auth.errIdentifier');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) found.email = t('auth.errEmail');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      const { challengeId, message } = await forgotPassword(
        values.identifier.trim(),
        values.email.trim(),
      );
      onSent(challengeId, message);
    } catch (error) {
      setFormError(authMessage(error, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="mt-1.5 text-base text-white/80">{t('auth.forgotBody')}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <AuthFormError message={formError} />
        <AuthField
          label={t('auth.identifier')}
          name="username"
          value={values.identifier}
          onChange={set('identifier')}
          error={errors.identifier}
          autoComplete="username"
          disabled={pending}
          autoFocus
        />
        <AuthField
          label={t('auth.registeredEmail')}
          name="email"
          type="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-data bg-white
            px-4 py-2.5 text-base font-medium text-[#0B120E] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed
            disabled:opacity-60"
        >
          {pending ? <AuthSpinner /> : null}
          {t('auth.forgotSend')}
        </button>
      </form>
    </>
  );
}

function PasswordStep({ onDone, onExpired }: { onDone: () => void; onExpired: () => void }) {
  const { t } = useTranslation('common');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => headingRef.current?.focus(), []);

  const set = (field: 'password' | 'confirm') => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (formError) setFormError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found: typeof errors = {};
    if (!RULES.every((rule) => rule.test(values.password))) {
      found.password = t('auth.passwordErrors.password_rules');
    }
    if (values.confirm !== values.password) found.confirm = t('auth.errMismatch');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await resetPassword(values.password, values.confirm);
      onDone();
    } catch (error) {
      if (error instanceof AuthError && error.code === 'RESET_EXPIRED') setExpired(true);
      setFormError(
        error instanceof AuthError && isPasswordErrorCode(error.code)
          ? t(`auth.passwordErrors.${error.code}`)
          : authMessage(error, t),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg focus:outline-none">
        {t('auth.forgotNewPassword')}
      </h2>
      <AuthFormError message={formError} />
      <AuthField
        label={t('auth.newPassword')}
        name="new-password"
        type="password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        autoComplete="new-password"
        disabled={pending || expired}
      />
      <ul aria-label={t('auth.rulesHeading')} className="space-y-1 text-sm">
        {RULES.map((rule) => {
          const met = rule.test(values.password);
          return (
            <li
              key={rule.key}
              className={cn('flex items-center gap-2', met ? 'text-white' : 'text-white/65')}
            >
              <Check size={14} aria-hidden="true" className={met ? 'opacity-100' : 'opacity-25'} />
              {t(`auth.${rule.key}`)}
              <span className="sr-only">{met ? t('auth.ruleMet') : t('auth.ruleNotMet')}</span>
            </li>
          );
        })}
      </ul>
      <AuthField
        label={t('auth.confirmNewPassword')}
        name="confirm-password"
        type="password"
        value={values.confirm}
        onChange={set('confirm')}
        error={errors.confirm}
        autoComplete="new-password"
        disabled={pending || expired}
      />
      {expired ? (
        <button
          type="button"
          onClick={onExpired}
          className="inline-flex w-full items-center justify-center rounded-data bg-white px-4
            py-2.5 text-base font-medium text-[#0B120E] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {t('auth.forgotStartAgain')}
        </button>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-data bg-white
            px-4 py-2.5 text-base font-medium text-[#0B120E] focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed
            disabled:opacity-60"
        >
          {pending ? <AuthSpinner /> : null}
          {pending ? t('auth.saving') : t('auth.savePassword')}
        </button>
      )}
    </form>
  );
}
