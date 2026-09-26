import { CameraOff, Check, ImageUp, RotateCcw, ShieldX, SwitchCamera, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthSpinner } from '@/components/auth/AuthField';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';
import { AuthError, logInWithCardImage, type NextStep } from '@/services/auth';

/**
 * Sign-in with the live camera and the one authorised QR code.
 *
 * The authorised code carries no readable payload, so nothing is decoded here: a
 * square crop of the viewfinder goes to the API a couple of times a second, and
 * the API compares it with the authorised code's pattern (see
 * `backend/app/core/badge.py`). There is no button that skips the scan — a match
 * is the only way in, and any other QR code is denied.
 */

type Phase = 'starting' | 'scanning' | 'checking' | 'verified' | 'denied' | 'offline' | 'blocked';
type Problem = 'denied' | 'none' | 'busy' | 'insecure' | 'failed';

const PROBLEM_TEXT = {
  denied: 'auth.cameraDenied',
  none: 'auth.cameraNone',
  busy: 'auth.cameraBusy',
  insecure: 'auth.cameraInsecure',
  failed: 'auth.cameraFailed',
} as const;

const STATUS_TEXT = {
  starting: 'auth.scanStarting',
  scanning: 'auth.scanReady',
  checking: 'auth.scanChecking',
  verified: 'auth.scanVerified',
  denied: 'auth.scanMismatch',
  offline: 'auth.scanOffline',
} as const;

/** The API refuses bodies over 32 KB, so each frame is stepped down to fit under it. */
const MAX_FRAME_BYTES = 30_000;
const FRAME_SIDE = 480;
const FRAME_INTERVAL_MS = 450;

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const quality of [0.72, 0.55, 0.4, 0.28]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_FRAME_BYTES) return blob;
  }
  return null;
}

function problemOf(error: unknown): Problem {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}

/** Four corner marks around the target square. Colour carries state; the status line says it in words. */
function Brackets({ tone }: { tone: 'idle' | 'ok' | 'bad' }) {
  const corners = [
    'M2 22V8a6 6 0 0 1 6-6h14',
    'M78 2h14a6 6 0 0 1 6 6v14',
    'M98 78v14a6 6 0 0 1-6 6H78',
    'M22 98H8a6 6 0 0 1-6-6V78',
  ];
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn(
        'absolute inset-0 h-full w-full transition-colors duration-200',
        tone === 'ok' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : 'text-white/90',
      )}
    >
      {corners.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function BadgeScanner({
  open,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  onSignedIn: (next: NextStep) => void;
}) {
  const titleId = useId();
  const { t } = useTranslation('common');

  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const inFlightRef = useRef(false);
  const doneRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('starting');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [cameraCount, setCameraCount] = useState(0);
  const [cameraIndex, setCameraIndex] = useState(-1);
  const [mirrored, setMirrored] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  // The server's words for a card it recognised and refused (revoked, inactive).
  const [denial, setDenial] = useState<string | null>(null);

  useFocusTrap(panelRef, open, onClose);

  const canvas = () => (canvasRef.current ??= document.createElement('canvas'));

  /** Send one image; true once signed in. */
  const verify = useCallback(
    async (image: Blob, source: 'camera' | 'upload'): Promise<boolean> => {
      inFlightRef.current = true;
      try {
        const next = await logInWithCardImage(image);
        doneRef.current = true;
        setPhase('verified');
        window.setTimeout(() => onSignedIn(next), 700);
        return true;
      } catch (error) {
        const code = error instanceof AuthError ? error.code : 'unknown';
        if (code === 'QR_INVALID') {
          setDenial(null);
          setPhase('denied');
        } else if (code === 'QR_REVOKED' || code === 'MEMBER_INACTIVE') {
          setDenial(error instanceof AuthError && error.message ? error.message : null);
          setPhase('denied');
        } else if (code === 'no_code') {
          if (source === 'upload') setUploadNote(t('auth.scanUploadNone'));
          setPhase((current) => (current === 'denied' ? current : 'scanning'));
        } else {
          setPhase('offline');
        }
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [onSignedIn, t],
  );
  const verifyRef = useRef(verify);
  verifyRef.current = verify;

  // A denial stays up long enough to read, then scanning carries on.
  useEffect(() => {
    if (phase !== 'denied') return;
    const timer = window.setTimeout(
      () => setPhase((current) => (current === 'denied' ? 'scanning' : current)),
      2500,
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let attached: HTMLVideoElement | null = null;
    let timer = 0;
    setPhase('starting');
    setProblem(null);
    setUploadNote(null);

    const block = (reason: Problem) => {
      if (cancelled) return;
      setProblem(reason);
      setPhase('blocked');
    };

    void (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        block('insecure');
        return;
      }
      const device = devicesRef.current[cameraIndex];
      const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // The rear camera on a phone; whatever there is on a laptop.
          video: device
            ? { deviceId: { exact: device.deviceId }, ...size }
            : { facingMode: { ideal: 'environment' }, ...size },
        });
      } catch (error) {
        block(problemOf(error));
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      video.srcObject = stream;
      attached = video;
      // A front-facing preview is mirrored, as people expect; the frames sent are not.
      setMirrored(stream.getVideoTracks()[0]?.getSettings().facingMode !== 'environment');
      await video.play().catch(() => undefined);

      if (!devicesRef.current.length) {
        const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        devicesRef.current = all.filter((d) => d.kind === 'videoinput');
        if (!cancelled) setCameraCount(devicesRef.current.length);
      }
      if (cancelled) return;
      setPhase('scanning');

      const tick = async () => {
        if (cancelled || doneRef.current) return;
        const side = Math.min(video.videoWidth, video.videoHeight);
        if (!inFlightRef.current && side > 0) {
          const frame = canvas();
          frame.width = frame.height = FRAME_SIDE;
          frame
            .getContext('2d')
            ?.drawImage(
              video,
              (video.videoWidth - side) / 2,
              (video.videoHeight - side) / 2,
              side,
              side,
              0,
              0,
              FRAME_SIDE,
              FRAME_SIDE,
            );
          const blob = await encode(frame);
          if (blob && !cancelled && !doneRef.current) await verifyRef.current(blob, 'camera');
        }
        if (!cancelled && !doneRef.current) timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
      };
      timer = window.setTimeout(tick, 300);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (attached) attached.srcObject = null;
    };
  }, [open, cameraIndex, attempt]);

  if (!open) return null;

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadNote(null);
    setPhase('checking');
    let signedIn = false;
    try {
      const bitmap = await createImageBitmap(file);
      let blob: Blob | null = null;
      for (const longest of [960, 720, 540]) {
        const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
        const frame = canvas();
        frame.width = Math.round(bitmap.width * scale);
        frame.height = Math.round(bitmap.height * scale);
        frame.getContext('2d')?.drawImage(bitmap, 0, 0, frame.width, frame.height);
        blob = await encode(frame);
        if (blob) break;
      }
      bitmap.close();
      if (blob) signedIn = await verifyRef.current(blob, 'upload');
      else setUploadNote(t('auth.scanUploadNone'));
    } catch {
      setUploadNote(t('auth.scanUploadNone'));
    }
    if (!signedIn) {
      setPhase((current) =>
        current === 'checking' || current === 'scanning'
          ? problem
            ? 'blocked'
            : 'scanning'
          : current,
      );
    }
  }

  const tone = phase === 'verified' ? 'ok' : phase === 'denied' ? 'bad' : 'idle';
  const status =
    phase === 'blocked' ? null : phase === 'denied' && denial ? denial : t(STATUS_TEXT[phase]);
  const statusTone =
    phase === 'verified'
      ? 'text-emerald-300'
      : phase === 'denied'
        ? 'text-red-300 font-medium'
        : phase === 'offline'
          ? 'text-amber-200'
          : 'text-white/80';
  const dotTone =
    phase === 'verified'
      ? 'bg-emerald-400'
      : phase === 'denied'
        ? 'bg-red-400'
        : phase === 'offline'
          ? 'bg-amber-300'
          : 'bg-white/70';

  const quietButton =
    'inline-flex min-h-[2.75rem] items-center gap-2 rounded-data border border-white/20 bg-white/[0.07] px-3.5 text-sm font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[calc(100svh-2rem)] w-full max-w-[26rem] overflow-y-auto rounded-2xl border border-white/15 bg-[#0B120E]/95 p-5 text-white shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-lg tracking-tight">
              {t('auth.scanTitle')}
            </h2>
            <p className="mt-1 text-sm text-white/65">{t('auth.scanBody')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('auth.scanClose')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {phase === 'blocked' && problem ? (
          <div role="alert" className="mt-5 rounded-xl border border-white/12 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10">
                <CameraOff size={18} aria-hidden="true" />
              </span>
              <h3 className="font-display text-base">{t('auth.cameraBlockedTitle')}</h3>
            </div>
            <p className="mt-3 text-sm text-white/75">
              {t(PROBLEM_TEXT[problem])} {t('auth.cameraFallback')}
            </p>
            {problem === 'denied' ? (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/75">
                <li>{t('auth.cameraStep1')}</li>
                <li>{t('auth.cameraStep2')}</li>
                <li>{t('auth.cameraStep3')}</li>
              </ol>
            ) : null}
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className={cn(quietButton, 'mt-4')}
            >
              <RotateCcw size={15} aria-hidden="true" />
              {t('auth.cameraRetry')}
            </button>
          </div>
        ) : (
          <div className="relative mt-5 aspect-square w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              aria-hidden="true"
              className={cn(
                'h-full w-full object-cover transition-opacity duration-300',
                phase === 'starting' ? 'opacity-0' : 'opacity-100',
                mirrored && '-scale-x-100',
              )}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[13%] rounded-lg shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]"
            >
              <Brackets tone={tone} />
            </div>
            {phase === 'starting' || phase === 'checking' ? (
              <div className="absolute inset-0 grid place-items-center">
                <AuthSpinner />
              </div>
            ) : null}
            {phase === 'verified' ? (
              <div className="absolute inset-0 grid place-items-center bg-black/55">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white">
                  <Check size={28} strokeWidth={2.5} aria-hidden="true" />
                </span>
              </div>
            ) : null}
            {phase === 'denied' ? (
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-red-950/90 px-3 py-2 text-sm font-medium text-red-100">
                <ShieldX size={16} aria-hidden="true" className="shrink-0" />
                {denial ?? t('auth.scanMismatch')}
              </div>
            ) : null}
          </div>
        )}

        {status ? (
          <p
            role="status"
            aria-live="polite"
            className={cn('mt-3 flex min-h-[1.5rem] items-center gap-2 text-sm', statusTone)}
          >
            <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', dotTone)} />
            {status}
          </p>
        ) : null}
        {uploadNote ? (
          <p role="alert" className="mt-1 text-sm text-amber-200">
            {uploadNote}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={phase === 'verified' || phase === 'checking'}
            className={quietButton}
          >
            <ImageUp size={16} aria-hidden="true" />
            {t('auth.scanUpload')}
          </button>
          {cameraCount > 1 && phase !== 'blocked' ? (
            <button
              type="button"
              onClick={() => setCameraIndex((index) => (index + 1) % cameraCount)}
              disabled={phase === 'verified'}
              className={quietButton}
            >
              <SwitchCamera size={16} aria-hidden="true" />
              {t('auth.scanSwitch')}
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={(event) => void upload(event)}
          />
        </div>

        <p className="mt-4 border-t border-white/10 pt-3 text-xs text-white/50">
          {t('auth.scanPrivacy')}
        </p>
      </div>
    </div>
  );
}
