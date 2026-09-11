import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sound on a background video, without ever risking playback.
 *
 * The rule every browser enforces: a video may autoplay only while it is muted.
 * So the video starts muted and stays that way until the browser will allow
 * sound, and the unmute is *attempted* rather than assumed — Safari in
 * particular will reject `play()` on an unmuted element even inside a gesture
 * if the user has not previously interacted with the origin.
 *
 * The order matters. `muted = false` is set first, then `play()` is awaited: if
 * that promise rejects, the element is put straight back to muted and played
 * again, because a rejected play on an unmuted video leaves it *paused*, and a
 * paused background video is a far worse failure than a silent one.
 *
 * Two surfaces use it, with different rules (see `HeroAudioOptions`). The
 * sign-in page starts silent and lets its soundtrack play twice. The site
 * behind it starts with sound — the reader has just clicked Sign in, which is
 * the gesture browsers ask for — and loops the sound with the footage.
 *
 * Choices are kept in `sessionStorage`, not `localStorage`: a reader who
 * unmuted this tab should not have a later visit start making noise at them.
 */

export interface HeroAudioOptions {
  /** Storage prefix, so each surface remembers its own mute and volume. */
  storageKey?: string;
  /** Whether sound is wanted before the reader has chosen either way. */
  soundByDefault?: boolean;
  /**
   * How many times the soundtrack plays before the page goes quiet again.
   * `Infinity` loops it with the footage. Unmuting again starts a fresh count.
   */
  playsWithSound?: number;
}

function readStored<T>(key: string, parse: (raw: string) => T, fallback: T): T {
  // Private mode, disabled site data, and embedded webviews all throw here.
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : parse(raw);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* the preference simply does not persist; nothing else changes */
  }
}

export interface HeroAudio {
  videoRef: React.RefObject<HTMLVideoElement>;
  muted: boolean;
  volume: number;
  /** True once a gesture has been seen, whether or not unmuting worked. */
  interacted: boolean;
  /** True when the browser refused to play unmuted, so the UI can say so. */
  blocked: boolean;
  toggleMuted: () => void;
  setVolume: (value: number) => void;
}

export function useHeroAudio({
  storageKey = 'sahayak.hero',
  soundByDefault = false,
  playsWithSound = 2,
}: HeroAudioOptions = {}): HeroAudio {
  const mutedKey = `${storageKey}.muted`;
  const volumeKey = `${storageKey}.volume`;
  const videoRef = useRef<HTMLVideoElement>(null);

  const [muted, setMuted] = useState(() =>
    readStored(mutedKey, (raw) => raw === 'true', !soundByDefault),
  );
  const [volume, setVolumeState] = useState(() =>
    readStored(
      volumeKey,
      (raw) => {
        const parsed = Number.parseFloat(raw);
        return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0.7;
      },
      0.7,
    ),
  );
  const [interacted, setInteracted] = useState(false);
  const [blocked, setBlocked] = useState(false);

  /**
   * Apply a mute state to the element, and report whether it survived.
   *
   * Returns false when the browser refused an unmuted play — the caller uses
   * that to leave the control in its muted state rather than showing a speaker
   * icon over a silent video.
   */
  const applyMuted = useCallback(
    async (next: boolean): Promise<boolean> => {
      const video = videoRef.current;
      if (!video) return false;

      video.muted = next;
      video.volume = volume;

      try {
        // `play()` returns undefined on older browsers; `await` handles both.
        await video.play();
        setBlocked(false);
        return true;
      } catch {
        if (!next) {
          // Refused while unmuted. Put it back and make sure it is still running.
          video.muted = true;
          void Promise.resolve(video.play()).catch(() => undefined);
          setBlocked(true);
        }
        return false;
      }
    },
    [volume],
  );

  /**
   * Ask for sound as soon as the video mounts, when sound is wanted.
   *
   * Straight after Sign in this succeeds: the page has already seen a click,
   * which is what browsers require. After a reload it is refused, and the first
   * gesture below tries again. Once only — the ref, not the dependency list, is
   * what stops a repeat.
   */
  const triedOnMount = useRef(false);
  useEffect(() => {
    if (triedOnMount.current) return;
    triedOnMount.current = true;
    if (!muted) void applyMuted(false);
  }, [muted, applyMuted]);

  /**
   * The first gesture anywhere on the page.
   *
   * Listens on the capture phase so it is not defeated by a handler that stops
   * propagation, and passively, so it never delays a scroll or a tap. It runs
   * once: whether the unmute succeeded or was refused, the reader now has an
   * explicit control and the page should stop trying on its own.
   *
   * A press on the sound control itself is left to the control. Handling it
   * here too would switch the sound on a moment before the control's own click
   * switched it straight back off.
   */
  useEffect(() => {
    if (interacted) return;

    let done = false;
    const onFirstGesture = (event: Event) => {
      if (done) return;
      if (event.target instanceof Element && event.target.closest('[data-audio-control]')) return;
      done = true;
      setInteracted(true);

      // Only reach for sound if the stored preference actually asks for it.
      if (!muted) void applyMuted(false);
    };

    const events: Array<keyof DocumentEventMap> = ['pointerdown', 'touchstart', 'keydown'];
    const options: AddEventListenerOptions = { capture: true, passive: true };
    events.forEach((event) => document.addEventListener(event, onFirstGesture, options));

    return () => {
      events.forEach((event) =>
        document.removeEventListener(event, onFirstGesture, { capture: true }),
      );
    };
  }, [interacted, muted, applyMuted]);

  /**
   * Go quiet once the soundtrack has been heard `playsWithSound` times over.
   *
   * `loop` means `ended` never fires, so the count comes from `timeupdate`: the
   * time between ticks is added up, and a tick that lands before the previous
   * one is the clip wrapping round. Counted in heard time rather than in loops,
   * so sound switched on part way through the clip still gets whole lengths.
   *
   * Only audible time counts — a refused unmute leaves `muted` false in state
   * while the element itself is silent.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || muted || !Number.isFinite(playsWithSound)) return;

    let heard = 0;
    let last = video.currentTime;

    const onTimeUpdate = () => {
      const now = video.currentTime;
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        last = now;
        return;
      }
      if (!video.muted) heard += now >= last ? now - last : duration - last + now;
      last = now;

      // Ticks land roughly every 250ms. Stopping a fraction early beats letting
      // the first beat of another pass through.
      if (heard >= playsWithSound * duration - 0.3) {
        video.muted = true;
        setMuted(true);
        writeStored(mutedKey, 'true');
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoRef, muted, playsWithSound, mutedKey]);

  /** Keep the element's volume in step, including while it is muted. */
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = volume;
  }, [volume]);

  const toggleMuted = useCallback(() => {
    // Silent for either reason reads as muted to the reader, so pressing the
    // control from there always asks for sound.
    const next = !(muted || blocked);
    setInteracted(true);

    void (async () => {
      const ok = await applyMuted(next);
      // Unmuting can be refused; muting never is.
      const settled = next ? true : ok;
      setMuted(settled ? next : true);
      writeStored(mutedKey, String(settled ? next : true));
    })();
  }, [muted, blocked, applyMuted, mutedKey]);

  const setVolume = useCallback(
    (value: number) => {
      const clamped = Math.min(1, Math.max(0, value));
      setVolumeState(clamped);
      writeStored(volumeKey, String(clamped));

      // Dragging the slider up off zero is itself a request to hear something.
      if (clamped > 0 && muted && interacted) {
        void (async () => {
          if (await applyMuted(false)) {
            setMuted(false);
            writeStored(mutedKey, 'false');
          }
        })();
      }
    },
    [muted, interacted, applyMuted, mutedKey, volumeKey],
  );

  return { videoRef, muted, volume, interacted, blocked, toggleMuted, setVolume };
}
