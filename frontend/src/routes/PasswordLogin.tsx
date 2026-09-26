import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { Field, FormError } from '@/components/portal/controls';
import { primaryButton, textLink } from '@/components/portal/styles';
import { LockLine } from '@/components/portal/LockLine';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAuth, type AuthNotice } from '@/hooks/authContext';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { authMessage } from '@/lib/authCopy';
import { logIn } from '@/services/auth';

/**
 * Log in another way: Member ID or username, and password.
 *
 * "Forgot password?" lives here and nowhere else in the portal, as the brief
 * asks: it is the answer to a problem this step can have.
 */
export default function PasswordLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.portal.passwordTitle'), t('auth.portal.passwordBody'));
  const { notice: authNotice, clearNotice } = useAuth();
  // A finished password reset arrives here with its own notice.
  const arrived = (useLocation().state as { notice?: AuthNotice } | null)?.notice;
  const notice = arrived ?? authNotice;

  const [values, setValues] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (field: 'identifier' | 'password') => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (formError) setFormError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found: typeof errors = {};
    if (!values.identifier.trim()) found.identifier = t('auth.errIdentifier');
    if (!values.password) found.password = t('auth.errPassword');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await logIn(values.identifier.trim(), values.password);
      clearNotice();
      onSignedIn();
    } catch (error) {
      setFormError(authMessage(error, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <PortalLayout>
      <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[36px]">
        {t('auth.portal.passwordTitle')}
      </h1>
      <p className="mt-2 text-[16px] text-white/[0.86]">{t('auth.portal.passwordBody')}</p>

      {notice ? (
        <p
          role="status"
          className="mt-5 rounded-[6px] border border-white/[0.35] bg-white/[0.08] px-3 py-2 text-[14px]"
        >
          {t(`auth.notice.${notice}`)}
        </p>
      ) : null}

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
          label={t('auth.password')}
          name="password"
          type="password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="current-password"
          disabled={pending}
        />
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? t('auth.portal.loggingIn') : t('auth.portal.logIn')}
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/forgot-password" className={textLink}>
          {t('auth.forgot')}
        </Link>
        <Link to="/login" className={textLink}>
          {t('auth.portal.backToScan')}
        </Link>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {pending ? t('auth.portal.loggingIn') : ''}
      </p>
      <LockLine />
    </PortalLayout>
  );
}
