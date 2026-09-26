import { useCallback, useEffect, useRef, useState } from 'react';

import { AuthError, verifyCardImage, type CardChallenge } from '@/services/auth';

/**
 * The camera and the member card, with no interface of its own.
 *
 * The card is the existing QR badge, which carries no readable payload, so
 * nothing is decoded in the browser: a square crop of the viewfinder goes to
 * the API about twice a second, and the API compares it with the card's pattern
 * (`backend/app/core/badge.py`). A match comes back as a sign-in challenge.
 *
 * - The camera starts only when `start()` is called, never on load.
 * - The rear camera is asked for first, then any camera.
 * - Tracks stop on a match, on `stop()`, on unmount, and before a restart.
 * - After the first match, nothing more is sent.
 * - `uploadFile()` sends a photo of the card the same way.
 */

export type ScannerPhase = 'idle' | 'starting' | 'scanning' | 'checking' | 'detected' | 'blocked';

export type CameraProblem = 'denied' | 'none' | 'busy' | 'insecure' | 'failed';

/** What the last frame or photo was refused for, in the server's words where it has them. */
export interface ScanRefusal {
  code: string;
  message: string;
}

/** The API refuses bodies over 32 KB, so each frame is stepped down to fit under it. */
const MAX_FRAME_BYTES = 30_000;
const FRAME_SIDE = 480;
const FRAME_INTERVAL_MS = 450;
/** An empty frame answers in a couple of hundred milliseconds; a recognised card takes longer. */
const CHECKING_AFTER_MS = 600;
/** How long the corners show neem before the member record replaces the scanner. */
const DETECTED_MS = 450;

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

function problemOf(error: unknown): CameraProblem {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}

export function useCardScanner(onMatch: (challenge: CardChallenge) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const devicesRef = useRef<MediaDeviceInfo[]>([]);
  const inFlightRef = useRef(false);
  const doneRef = useRef(false);
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;

  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [refusal, setRefusal] = useState<ScanRefusal | null>(null);
  const [cameraCount, setCameraCount] = useState(0);
  const [cameraIndex, setCameraIndex] = useState(-1);
  const [mirrored, setMirrored] = useState(false);
  const [run, setRun] = useState(0);

  const canvas = () => (canvasRef.current ??= document.createElement('canvas'));

  /** Send one image. True once a card matched. */
  const send = useCallback(async (image: Blob, source: 'camera' | 'upload') => {
    inFlightRef.current = true;
    const slow = window.setTimeout(() => {
      setPhase((current) => (current === 'scanning' ? 'checking' : current));
    }, CHECKING_AFTER_MS);
    try {
      const challenge = await verifyCardImage(image);
      doneRef.current = true;
      setRefusal(null);
      setPhase('detected');
      window.setTimeout(() => onMatchRef.current(challenge), DETECTED_MS);
      return true;
    } catch (error) {
      const code = error instanceof AuthError ? error.code : 'unknown';
      if (code === 'no_code') {
        if (source === 'upload') setRefusal({ code: 'no_code', message: '' });
      } else {
        setRefusal({ code, message: error instanceof AuthError ? error.message : '' });
      }
      return false;
    } finally {
      window.clearTimeout(slow);
      inFlightRef.current = false;
      setPhase((current) => (current === 'checking' ? 'scanning' : current));
    }
  }, []);

  // The camera, for as long as a run is live.
  useEffect(() => {
    if (run === 0) return;
    doneRef.current = false;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let attached: HTMLVideoElement | null = null;
    let timer = 0;
    setPhase('starting');
    setProblem(null);

    const block = (reason: CameraProblem) => {
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
          if (blob && !cancelled && !doneRef.current) await send(blob, 'camera');
        }
        if (doneRef.current) {
          // Matched: the camera has done its job.
          stream?.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!cancelled) timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
      };
      timer = window.setTimeout(tick, 300);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (attached) attached.srcObject = null;
    };
  }, [run, cameraIndex, send]);

  const start = useCallback(() => {
    setRefusal(null);
    setRun((count) => count + 1);
  }, []);

  const stop = useCallback(() => {
    setRun(0);
    setPhase('idle');
    setProblem(null);
  }, []);

  const switchCamera = useCallback(() => {
    setCameraIndex((index) => (index + 1) % Math.max(1, devicesRef.current.length));
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setRefusal(null);
      const before = phase;
      setPhase('checking');
      let matched = false;
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
        if (blob) matched = await send(blob, 'upload');
        else setRefusal({ code: 'no_code', message: '' });
      } catch {
        setRefusal({ code: 'no_code', message: '' });
      }
      if (!matched) setPhase(before === 'checking' ? 'idle' : before);
    },
    [phase, send],
  );

  return {
    videoRef,
    phase,
    problem,
    refusal,
    cameraCount,
    mirrored,
    start,
    stop,
    switchCamera,
    uploadFile,
    clearRefusal: () => setRefusal(null),
  };
}
