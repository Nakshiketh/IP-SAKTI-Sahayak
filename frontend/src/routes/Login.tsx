import { Camera, ImageUp, SwitchCamera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { CodeEntry } from '@/components/portal/CodeEntry';
import { FormError } from '@/components/portal/controls';
import { primaryButton, secondaryButton, textLink } from '@/components/portal/styles';
import { LockLine } from '@/components/portal/LockLine';
import { MemberRecord } from '@/components/portal/MemberRecord';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { ScannerViewport } from '@/components/portal/ScannerViewport';
import { useAuth, type AuthNotice } from '@/hooks/authContext';
import { useCardScanner, type CameraProblem } from '@/hooks/useCardScanner';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { verifyLoginCode, type CardChallenge } from '@/services/auth';

/**
 * The Registered Member Portal: scan the member card, then enter the code.
 *
 * One path through the middle: "Scan Member ID". Everything else ("Log in
 * another way", uploading a photo) is offered beside it, not in front of it.
 * The camera starts only when the reader asks.
 *
 * Three steps on one page, each announced and each moving focus to its own
 * heading: the scanner; the member record with the code boxes; and the short
 * "Verified. Opening your dashboard…" before the home page.
 */

type Step = { kind: 'scan' } | { kind: 'code'; challenge: CardChallenge } | { kind: 'success' };

const PROBLEM_TEXT = {
  denied: 'auth.portal.cameraDenied',
  insecure: 'auth.portal.cameraInsecure',
  none: 'auth.portal.cameraNone',
  busy: 'auth.portal.cameraBusy',
  failed: 'auth.portal.cameraFailed',
} as const satisfies Record<CameraProblem, string>;

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation('common');
  useDocumentMeta(t('auth.portal.title'), t('auth.portal.subtitle'));

  const { notice: authNotice, clearNotice } = useAuth();
  const arrived = (useLocation().state as { notice?: AuthNotice } | null)?.notice;
  const notice = arrived ?? authNotice;

  const [step, setStep] = useState<Step>({ kind: 'scan' });
  const [announcement, setAnnouncement] = useState('');
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scanner = useCardScanner((challenge) => setStep({ kind: 'code', challenge }));
  const { phase, problem, refusal } = scanner;

  // Focus follows the step, so a keyboard or screen-reader user lands on it.
  useEffect(() => {
    if (step.kind !== 'scan') stepHeading.current?.focus();
  }, [step.kind]);

  // Say each change of state once, politely.
  useEffect(() => {
    const said: Partial<Record<typeof phase, string>> = {
      starting: t('auth.portal.cameraPermission'),
      scanning: t('auth.portal.scanning'),
      checking: t('auth.portal.checking'),
      detected: t('auth.code.verified'),
    };
    if (phase === 'blocked' && problem) setAnnouncement(t(PROBLEM_TEXT[problem]));
    else if (said[phase]) setAnnouncement(said[phase]!);
  }, [phase, problem, t]);

  const refusalText = refusal
    ? refusal.code === 'no_code'
      ? t('auth.portal.uploadNone')
      : refusal.message || t('auth.errGeneric')
    : null;
  useEffect(() => {
    if (refusalText) setAnnouncement(refusalText);
  }, [refusalText]);

  const status =
    phase === 'starting'
      ? t('auth.portal.cameraPermission')
      : phase === 'scanning'
        ? t('auth.portal.scanning')
        : phase === 'checking'
          ? t('auth.portal.checking')
          : phase === 'detected'
            ? t('auth.code.verified')
            : null;

  const scanning = phase === 'starting' || phase === 'scanning' || phase === 'checking';

  return (
    <PortalLayout>
      <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[36px]">
        {t('auth.portal.title')}
      </h1>
      <p className="mt-2 text-[16px] leading-[1.5] text-white/[0.86]">
        {t('auth.portal.subtitle')}
      </p>

      {notice && step.kind === 'scan' ? (
        <p
          role="status"
          className="mt-5 rounded-[6px] border border-white/[0.35] bg-white/[0.08] px-3 py-2 text-[14px]"
        >
          {t(`auth.notice.${notice}`)}
        </p>
      ) : null}

      {step.kind === 'scan' ? (
        <div className="mt-6">
          <ScannerViewport videoRef={scanner.videoRef} phase={phase} mirrored={scanner.mirrored}>
            {phase === 'idle' || phase === 'blocked' ? (
              <div className="absolute inset-0 grid place-items-center">
                <Camera size={28} aria-hidden="true" className="text-white/[0.55]" />
              </div>
            ) : null}
          </ScannerViewport>

          <p className="mt-3 min-h-[1.5rem] text-[14px] text-white/[0.86]">{status}</p>
          <div className="space-y-2">
            {phase === 'blocked' && problem ? (
              <FormError message={t(PROBLEM_TEXT[problem])} />
            ) : null}
            <FormError message={refusalText} />
          </div>

          <div className="mt-4 space-y-3">
            {scanning ? (
              <div className="flex gap-3">
                <button type="button" onClick={scanner.stop} className={secondaryButton}>
                  {t('auth.portal.cancel')}
                </button>
                {scanner.cameraCount > 1 ? (
                  <button type="button" onClick={scanner.switchCamera} className={secondaryButton}>
                    <SwitchCamera size={18} aria-hidden="true" />
                    {t('auth.portal.switchCamera')}
                  </button>
                ) : null}
              </div>
            ) : phase === 'detected' ? null : (
              <button
                type="button"
                onClick={() => {
                  clearNotice();
                  scanner.start();
                }}
                className={primaryButton}
              >
                {phase === 'blocked' ? t('auth.portal.tryCamera') : t('auth.portal.scan')}
              </button>
            )}

            <div className="flex items-center gap-3 py-1" aria-hidden="true">
              <span className="h-px flex-1 bg-white/25" />
              <span className="text-[14px] text-white/[0.78]">{t('auth.portal.or')}</span>
              <span className="h-px flex-1 bg-white/25" />
            </div>

            <Link to="/login/password" className={secondaryButton}>
              {t('auth.portal.another')}
            </Link>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={phase === 'checking' || phase === 'detected'}
              className={`${textLink} inline-flex items-center gap-2`}
            >
              <ImageUp size={16} aria-hidden="true" />
              {t('auth.portal.upload')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void scanner.uploadFile(file);
              }}
            />
          </div>
        </div>
      ) : null}

      {step.kind === 'code' ? (
        <div className="mt-6">
          <h2
            ref={stepHeading}
            tabIndex={-1}
            className="text-[20px] font-semibold text-[#8FD1A8] focus:outline-none"
          >
            {t('auth.code.verified')}
          </h2>
          <div className="mt-3">
            <MemberRecord member={step.challenge.member} />
          </div>
          <div className="mt-6">
            <CodeEntry
              challengeId={step.challenge.challengeId}
              resendAvailableAt={step.challenge.resendAvailableAt}
              intro={t('auth.code.sentTo', { email: step.challenge.maskedEmail })}
              onSubmit={async (code) => {
                await verifyLoginCode(step.challenge.challengeId, code);
                setStep({ kind: 'success' });
                setAnnouncement(t('auth.portal.success'));
                window.setTimeout(() => {
                  clearNotice();
                  onSignedIn();
                }, 700);
              }}
              onRestart={() => {
                setStep({ kind: 'scan' });
                scanner.start();
              }}
              restartLabel={t('auth.code.scanAgain')}
              onAnnounce={setAnnouncement}
            />
          </div>
        </div>
      ) : null}

      {step.kind === 'success' ? (
        <h2
          ref={stepHeading}
          tabIndex={-1}
          className="mt-8 text-[20px] font-semibold text-[#8FD1A8] focus:outline-none"
        >
          {t('auth.portal.success')}
        </h2>
      ) : null}

      <LockLine />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </PortalLayout>
  );
}
