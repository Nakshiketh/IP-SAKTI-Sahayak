import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { CodeEntry } from '@/components/portal/CodeEntry';
import { Field, FormError, PasswordChecklist } from '@/components/portal/controls';
import { primaryButton, textLink } from '@/components/portal/styles';
import { LockLine } from '@/components/portal/LockLine';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { authMessage, isPasswordErrorCode, PASSWORD_RULES as RULES } from '@/lib/authCopy';
import { AuthError, forgotPassword, resetPassword, verifyResetCode } from '@/services/auth';

/**
 * Forgot password: details, then the emailed code, then a new password.
 *
 * The first answer is the same whether or not the details matched a member,
 * and the code step does not say where a code was sent: either would tell a
 * stranger which Member IDs and emails belong together. A code that never
 * arrives simply never verifies.
 */

type Step =
  | { kind: 'details' }
  | { kind: 'code'; challengeId: string; resendAvailableAt: number; message: string }
  | { kind: 'password' };

export default function ForgotPassword() {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.forgotTitle'), t('auth.forgotBody'));
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'details' });
  const [announcement, setAnnouncement] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step.kind !== 'details') heading.current?.focus();
  }, [step.kind]);

  return (
    <PortalLayout>
      <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[36px]">
        {t('auth.forgotTitle')}
      </h1>

      {step.kind === 'details' ? (
        <DetailsStep
          onSent={(challengeId, message) => {
            setAnnouncement(message);
            setStep({
              kind: 'code',
              challengeId,
              message,
              resendAvailableAt: Date.now() / 1000 + 60,
            });
          }}
        />
      ) : null}

      {step.kind === 'code' ? (
        <div className="mt-6">
          <h2 ref={heading} tabIndex={-1} className="text-[20px] font-semibold focus:outline-none">
            {t('auth.code.title')}
          </h2>
          {/* Announced once, by the live region at the foot of the page. */}
          <p className="mt-2 text-[16px] text-white/[0.86]">{step.message}</p>
          <div className="mt-4">
            <CodeEntry
              challengeId={step.challengeId}
              resendAvailableAt={step.resendAvailableAt}
              intro={t('auth.code.sentReset')}
              onSubmit={async (code) => {
                await verifyResetCode(step.challengeId, code);
                setStep({ kind: 'password' });
              }}
              onRestart={() => setStep({ kind: 'details' })}
              restartLabel={t('auth.forgotStartAgain')}
              onAnnounce={setAnnouncement}
            />
          </div>
        </div>
      ) : null}

      {step.kind === 'password' ? (
        <PasswordStep
          headingRef={heading}
          onDone={() => navigate('/login/password', { state: { notice: 'passwordUpdated' } })}
          onExpired={() => setStep({ kind: 'details' })}
        />
      ) : null}

      <p className="mt-6">
        <Link to="/login/password" className={textLink}>
          {t('auth.backToLogin')}
        </Link>
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <LockLine />
    </PortalLayout>
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
      <p className="mt-2 text-[16px] text-white/[0.86]">{t('auth.forgotBody')}</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <FormError message={formError} />
        <Field
          label={t('auth.identifier')}
          name="username"
          value={values.identifier}
          onChange={set('identifier')}
          error={errors.identifier}
          autoComplete="username"
          disabled={pending}
          autoFocus
        />
        <Field
          label={t('auth.registeredEmail')}
          name="email"
          type="email"
          inputMode="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          disabled={pending}
        />
        <button type="submit" disabled={pending} className={primaryButton}>
          {t('auth.forgotSend')}
        </button>
      </form>
    </>
  );
}

function PasswordStep({
  headingRef,
  onDone,
  onExpired,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  onDone: () => void;
  onExpired: () => void;
}) {
  const { t } = useTranslation('common');
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

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
    <form onSubmit={submit} noValidate className="mt-6 space-y-5">
      <h2 ref={headingRef} tabIndex={-1} className="text-[20px] font-semibold focus:outline-none">
        {t('auth.forgotNewPassword')}
      </h2>
      <FormError message={formError} />
      <Field
        label={t('auth.newPassword')}
        name="new-password"
        type="password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        autoComplete="new-password"
        disabled={pending || expired}
        describedBy="reset-rules"
      />
      <PasswordChecklist password={values.password} id="reset-rules" />
      <Field
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
        <button type="button" onClick={onExpired} className={primaryButton}>
          {t('auth.forgotStartAgain')}
        </button>
      ) : (
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? t('auth.saving') : t('auth.savePassword')}
        </button>
      )}
    </form>
  );
}
