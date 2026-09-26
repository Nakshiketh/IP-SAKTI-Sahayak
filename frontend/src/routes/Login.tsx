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
import { useAuth } from '@/hooks/authContext';
import { authMessage } from '@/lib/authCopy';
import { logIn, type NextStep } from '@/services/auth';

/**
 * The front door.
 *
 * Full-viewport video, a frosted card over it, and two ways in: the member
 * card shown to the camera, or a Member ID or username with a password. There
 * is no registration: members are issued.
 *
 * This is the one surface in the product that sits on video rather than paper,
 * which is why it carries its own field and button styling. Everything past it
 * is the reference document the rest of the app is.
 */

type SignedIn = (next: NextStep) => void;

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.signInTitle'), t('auth.heroBody'));

  const audio = useHeroAudio();
  const { notice, clearNotice } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const signedIn: SignedIn = () => {
    clearNotice();
    onSignedIn();
  };

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
            <h1 className="font-display text-xl tracking-tight">{t('auth.signInTitle')}</h1>
            <p className="mt-1.5 text-base text-white/80">{t('auth.signInBody')}</p>

            {notice ? (
              <p
                role="status"
                className="mt-4 rounded-data border border-white/25 bg-white/[0.08] px-3 py-2
                  text-sm text-white"
              >
                {t(`auth.notice.${notice}`)}
              </p>
            ) : null}

            <SignInForm onSignedIn={signedIn} onScan={() => setScannerOpen(true)} />
          </div>
        </main>

        <footer className="flex items-end justify-between gap-4 px-5 py-5 sm:px-8">
          <p className="max-w-[24rem] text-xs leading-relaxed text-white/70">
            {t('auth.membersOnly')}
          </p>
          <AudioControl {...audio} />
        </footer>
      </div>

      <BadgeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSignedIn={(next) => {
          setScannerOpen(false);
          signedIn(next);
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

function SignInForm({ onSignedIn, onScan }: { onSignedIn: SignedIn; onScan: () => void }) {
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
    if (!values.username.trim()) found.username = t('auth.errIdentifier');
    if (!values.password) found.password = t('auth.errPassword');
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    setFormError(null);
    try {
      onSignedIn(await logIn(values.username.trim(), values.password));
    } catch (error) {
      setFormError(authMessage(error, t));
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
          label={t('auth.identifier')}
          name="username"
          value={values.username}
          onChange={set('username')}
          error={errors.username}
          autoComplete="username"
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
