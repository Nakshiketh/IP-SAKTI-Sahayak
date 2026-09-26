import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AudioControl } from '@/components/auth/AudioControl';
import { AuthField, AuthFormError, AuthSpinner } from '@/components/auth/AuthField';
import { HeroVideo } from '@/components/auth/HeroVideo';
import { useAuth } from '@/hooks/authContext';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useHeroAudio } from '@/hooks/useHeroAudio';
import { cn } from '@/lib/cn';
import { authMessage, isPasswordErrorCode, PASSWORD_RULES as RULES } from '@/lib/authCopy';
import { AuthError, changePassword } from '@/services/auth';

/**
 * First sign-in: replace the temporary password.
 *
 * Reached only on a restricted session, which can do nothing else. The four
 * rules are shown as a checklist that fills in as the reader types; the server
 * enforces the same rules and is the one that decides.
 *
 * Same surface as the sign-in page — the video and the frosted card — because
 * it is the same moment: the reader has not reached the site yet.
 */

export default function CreatePassword({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.createTitle'), t('auth.createBody'));
  const audio = useHeroAudio();
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
      // A rule the server holds that the checklist cannot (not the temporary
      // password, not the username or Member ID) comes back by code.
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
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-xl tracking-tight focus:outline-none"
            >
              {t('auth.createTitle')}
            </h1>
            <p className="mt-1.5 text-base text-white/80">{t('auth.createBody')}</p>
            {user ? <p className="mt-1 text-sm text-white/70">{user.name}</p> : null}

            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <AuthFormError message={formError} />

              <AuthField
                label={t('auth.newPassword')}
                name="new-password"
                type="password"
                value={values.password}
                onChange={set('password')}
                error={errors.password}
                autoComplete="new-password"
                disabled={pending}
              />

              <ul aria-label={t('auth.rulesHeading')} className="space-y-1 text-sm">
                {RULES.map((rule) => {
                  const met = rule.test(values.password);
                  return (
                    <li
                      key={rule.key}
                      className={cn(
                        'flex items-center gap-2',
                        met ? 'text-white' : 'text-white/65',
                      )}
                    >
                      <Check
                        size={14}
                        aria-hidden="true"
                        className={met ? 'opacity-100' : 'opacity-25'}
                      />
                      {t(`auth.${rule.key}`)}
                      <span className="sr-only">
                        {met ? t('auth.ruleMet') : t('auth.ruleNotMet')}
                      </span>
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
                disabled={pending}
              />

              <button
                type="submit"
                disabled={pending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-data
                  bg-white px-4 py-2.5 text-base font-medium text-[#0B120E] transition
                  hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? <AuthSpinner /> : null}
                {pending ? t('auth.saving') : t('auth.savePassword')}
              </button>
              <p className="sr-only" role="status">
                {pending ? t('auth.saving') : ''}
              </p>
            </form>

            <p className="mt-6 border-t border-white/15 pt-5 text-center text-sm text-white/75">
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-data text-white underline underline-offset-4
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {t('auth.signOut')}
              </button>
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
