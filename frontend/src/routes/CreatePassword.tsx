import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Field, FormError, PasswordChecklist } from '@/components/portal/controls';
import { primaryButton, textLink } from '@/components/portal/styles';
import { LockLine } from '@/components/portal/LockLine';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAuth } from '@/hooks/authContext';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { authMessage, isPasswordErrorCode, PASSWORD_RULES as RULES } from '@/lib/authCopy';
import { AuthError, changePassword } from '@/services/auth';

/**
 * First sign-in: replace the temporary password.
 *
 * Reached only on a restricted session, which can do nothing else. The four
 * rules fill in as the reader types, with a four-segment strength bar; the
 * server holds the same rules and is the one that decides.
 */
export default function CreatePassword({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.createTitle'), t('auth.createBody'));
  const { user, signOut } = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
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
      await changePassword({ newPassword: values.password, confirmPassword: values.confirm });
      onDone();
    } catch (error) {
      // Rules the checklist cannot see (not the temporary password, not the
      // username or Member ID) come back from the server by code.
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
    <PortalLayout>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-[28px] font-semibold leading-tight focus:outline-none sm:text-[36px]"
      >
        {t('auth.createTitle')}
      </h1>
      <p className="mt-2 text-[16px] text-white/[0.86]">{t('auth.createBody')}</p>
      {user ? (
        <p className="mt-2 text-[14px] text-white/[0.78]">
          {user.name} <span className="tabular-nums">({user.memberId})</span>
        </p>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <FormError message={formError} />
        <Field
          label={t('auth.newPassword')}
          name="new-password"
          type="password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="new-password"
          disabled={pending}
          describedBy="create-rules"
        />
        <PasswordChecklist password={values.password} id="create-rules" />
        <Field
          label={t('auth.confirmNewPassword')}
          name="confirm-password"
          type="password"
          value={values.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          autoComplete="new-password"
          disabled={pending}
        />
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? t('auth.saving') : t('auth.savePassword')}
        </button>
        <p className="sr-only" role="status" aria-live="polite">
          {pending ? t('auth.saving') : ''}
        </p>
      </form>

      <p className="mt-5">
        <button type="button" onClick={() => void signOut()} className={textLink}>
          {t('auth.portal.logOut')}
        </button>
      </p>
      <LockLine />
    </PortalLayout>
  );
}
