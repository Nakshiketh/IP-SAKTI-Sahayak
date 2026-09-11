import { ScanLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AudioControl } from '@/components/auth/AudioControl';
import { AuthField, AuthFormError, AuthSpinner } from '@/components/auth/AuthField';
import { BadgeScanner } from '@/components/auth/BadgeScanner';
import { HeroVideo } from '@/components/auth/HeroVideo';
import { LanguageSelector } from '@/components/layout/LanguageSelector';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useHeroAudio } from '@/hooks/useHeroAudio';
import { AuthError, registerAccount, signIn, type AuthSession } from '@/services/auth';

/**
 * The front door.
 *
 * Full-viewport video, a frosted card over it, and three ways in: badge, or
 * username and password, or register. Sign-in and register are two states of
 * one card rather than two routes, so the swap costs an animation instead of a
 * navigation.
 *
 * This is the one surface in the product that sits on video rather than paper,
 * which is why it carries its own field and button styling. Everything past it
 * is the reference document the rest of the app is.
 */

type Mode = 'signin' | 'register';

export default function Login({ onSignedIn }: { onSignedIn: (session: AuthSession) => void }) {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.signInTitle'), t('auth.heroBody'));

  const audio = useHeroAudio();
  const [mode, setMode] = useState<Mode>('signin');
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <>
      <HeroVideo videoRef={audio.videoRef} muted={audio.muted} />

      <a
        href="#signin-card"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
          focus:rounded-data focus:bg-white focus:px-4 focus:py-2 focus:text-base
          focus:font-medium focus:text-[#0B120E]"
      >
        {t('auth.signInTitle')}
      </a>

      {/* 100svh, not 100vh: mobile Safari measures the large viewport unit with
          the browser chrome retracted, which pushes a 100vh layout under the
          address bar until the reader scrolls. */}
      <div className="relative flex min-h-[100svh] flex-col text-white">
        <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="leading-tight">
            <span className="block font-display text-md">{t('brand.name')}</span>
            <span className="block text-xs text-white/75">{t('brand.descriptor')}</span>
          </div>
          <LanguageSelector className="border-white/25 bg-black/30 text-white" />
        </header>

        <main
          id="signin-card"
          className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6"
        >
          <div
            className="w-full max-w-[26rem] rounded-data border border-white/25 bg-[#0B120E]/20 p-6
            shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.2)]
            backdrop-blur-[10px] backdrop-saturate-150 sm:p-8"
          >
            <h1 className="font-display text-xl tracking-tight">
              {mode === 'signin' ? t('auth.signInTitle') : t('auth.registerTitle')}
            </h1>
            <p className="mt-1.5 text-base text-white/80">
              {mode === 'signin' ? t('auth.signInBody') : t('auth.registerBody')}
            </p>

            {/* `key` remounts the subtree on a mode change, which both runs the
                entrance transition and clears whatever the other form held —
                a half-typed registration left behind a sign-in is a small
                privacy leak on a shared machine. */}
            <div key={mode} className="animate-[fadeUp_240ms_ease-out]">
              {mode === 'signin' ? (
                <SignInForm onSignedIn={onSignedIn} onScan={() => setScannerOpen(true)} />
              ) : (
                <RegisterForm onSignedIn={onSignedIn} />
              )}
            </div>

            <p className="mt-6 border-t border-white/15 pt-5 text-center text-base text-white/75">
              {mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')}
                className="rounded-data font-medium text-white underline underline-offset-4
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {mode === 'signin' ? t('auth.createOne') : t('auth.goSignIn')}
              </button>
            </p>
          </div>
        </main>

        <footer className="flex items-end justify-between gap-4 px-5 py-5 sm:px-8">
          <p className="max-w-[24rem] text-xs leading-relaxed text-white/70">
            {t('auth.demoHint')}
          </p>
          <AudioControl {...audio} />
        </footer>
      </div>

      <BadgeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSignedIn={(session) => {
          setScannerOpen(false);
          onSignedIn(session);
        }}
      />
    </>
  );
}

const primaryButton =
  'inline-flex w-full items-center justify-center gap-2 rounded-data bg-white px-4 py-2.5 ' +
  'text-base font-medium text-[#0B120E] transition hover:bg-white/90 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

function SignInForm({
  onSignedIn,
  onScan,
}: {
  onSignedIn: (session: AuthSession) => void;
  onScan: () => void;
}) {
  const { t } = useTranslation('common');
  const [values, setValues] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (field: 'username' | 'password') => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear a complaint as soon as it is being addressed; holding it until the
    // next submit makes the form feel like it is not listening.
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (formError) setFormError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const found: typeof errors = {};
    if (!values.username.trim()) found.username = t('auth.errUsername');
    if (!values.password) found.password = t('auth.errPassword');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    setFormError(null);
    try {
      onSignedIn(await signIn(values.username.trim(), values.password));
    } catch (error) {
      setFormError(error instanceof AuthError ? error.message : t('auth.errGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onScan}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-data
          border border-white/25 bg-white/[0.06] px-4 py-2.5 text-base font-medium text-white
          transition hover:border-white/40 hover:bg-white/[0.12]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <ScanLine size={18} aria-hidden="true" />
        {t('auth.scanBadge')}
      </button>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-white/15" />
        <span className="text-xs uppercase tracking-[0.14em] text-white/60">{t('auth.or')}</span>
        <span className="h-px flex-1 bg-white/15" />
      </div>

      <form onSubmit={submit} noValidate className="space-y-4">
        <AuthFormError message={formError} />

        <AuthField
          label={t('auth.username')}
          name="username"
          value={values.username}
          onChange={set('username')}
          error={errors.username}
          autoComplete="username"
          placeholder={t('auth.usernameExample')}
          disabled={pending}
        />

        <div>
          <AuthField
            label={t('auth.password')}
            name="password"
            type="password"
            value={values.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="current-password"
            disabled={pending}
          />
          <div className="mt-2 text-right">
            <a
              href="#reset"
              className="rounded-data text-xs text-white/60 underline underline-offset-4
                hover:text-white focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-white/70"
            >
              {t('auth.forgot')}
            </a>
          </div>
        </div>

        <button type="submit" className={primaryButton} disabled={pending}>
          {pending ? <AuthSpinner /> : null}
          {pending ? t('auth.submitting') : t('auth.submit')}
        </button>

        {/* Announced without stealing focus from the field being corrected. */}
        <p className="sr-only" role="status">
          {pending ? t('auth.submitting') : ''}
        </p>
      </form>
    </>
  );
}

function RegisterForm({ onSignedIn }: { onSignedIn: (session: AuthSession) => void }) {
  const { t } = useTranslation('common');
  const [values, setValues] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  type Field = keyof typeof values;
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (field: Field) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (formError) setFormError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const found: Partial<Record<Field, string>> = {};
    if (!values.name.trim()) found.name = t('auth.errName');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) found.email = t('auth.errEmail');
    if (values.username.trim().length < 3) found.username = t('auth.errUsernameShort');
    if (values.password.length < 8) found.password = t('auth.errPasswordShort');
    if (!values.confirmPassword) found.confirmPassword = t('auth.errConfirm');
    else if (values.confirmPassword !== values.password)
      found.confirmPassword = t('auth.errMismatch');

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    setFormError(null);
    try {
      onSignedIn(
        await registerAccount({
          name: values.name.trim(),
          email: values.email.trim(),
          username: values.username.trim(),
          password: values.password,
        }),
      );
    } catch (error) {
      setFormError(error instanceof AuthError ? error.message : t('auth.errGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-4">
      <AuthFormError message={formError} />

      <AuthField
        label={t('auth.name')}
        name="name"
        value={values.name}
        onChange={set('name')}
        error={errors.name}
        autoComplete="name"
        disabled={pending}
        autoFocus
      />
      <AuthField
        label={t('auth.email')}
        name="email"
        type="email"
        value={values.email}
        onChange={set('email')}
        error={errors.email}
        autoComplete="email"
        disabled={pending}
      />
      <AuthField
        label={t('auth.username')}
        name="username"
        value={values.username}
        onChange={set('username')}
        error={errors.username}
        autoComplete="username"
        disabled={pending}
      />
      <AuthField
        label={t('auth.password')}
        name="password"
        type="password"
        value={values.password}
        onChange={set('password')}
        error={errors.password}
        autoComplete="new-password"
        disabled={pending}
      />
      <AuthField
        label={t('auth.confirmPassword')}
        name="confirmPassword"
        type="password"
        value={values.confirmPassword}
        onChange={set('confirmPassword')}
        error={errors.confirmPassword}
        autoComplete="new-password"
        disabled={pending}
      />

      <button type="submit" className={primaryButton} disabled={pending}>
        {pending ? <AuthSpinner /> : null}
        {pending ? t('auth.creating') : t('auth.createSubmit')}
      </button>

      <p className="sr-only" role="status">
        {pending ? t('auth.creating') : ''}
      </p>
    </form>
  );
}
