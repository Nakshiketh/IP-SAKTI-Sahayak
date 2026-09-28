import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * How many characters of an answer are written in so far.
 *
 * The answer is complete when it arrives; this only paces how it appears, so the
 * reader sees it being set down rather than dropped on the page. Two rules keep
 * that from costing them anything:
 *
 * - It never takes longer than `MAX_MS`. A long answer writes faster, not for
 *   longer, and nobody waits on an animation to read what they asked for.
 * - Any key or pointer press finishes it at once, and a reader who has asked
 *   for reduced motion — or a browser that cannot say — gets the whole answer
 *   straight away.
 *
 * The frame loop follows ddoemonn's "Streaming Text" on 21st.dev: characters
 * owed accumulate per frame, and one long frame cannot jump the text ahead.
 */
const MIN_CHARS_PER_SECOND = 72;
const MAX_MS = 2400;
const MAX_FRAME_DELTA = 64;

export function useStreamReveal(total: number, active: boolean, key: string) {
  const reduced = useReducedMotion();
  const canAnimate =
    active && !reduced && typeof window !== 'undefined' && typeof window.matchMedia === 'function';

  const [revealed, setRevealed] = useState(canAnimate ? 0 : total);
  const cursor = useRef(revealed);

  useEffect(() => {
    if (!canAnimate) {
      cursor.current = total;
      setRevealed(total);
      return;
    }

    cursor.current = 0;
    setRevealed(0);

    const perSecond = Math.max(MIN_CHARS_PER_SECOND, (total * 1000) / MAX_MS);
    const interval = 1000 / perSecond;
    let frame = 0;
    let last = performance.now();
    let carry = 0;

    const finish = () => {
      cancelAnimationFrame(frame);
      cursor.current = total;
      setRevealed(total);
      window.removeEventListener('keydown', finish);
      window.removeEventListener('pointerdown', finish);
    };

    const tick = (now: number) => {
      carry += Math.min(now - last, MAX_FRAME_DELTA);
      last = now;
      if (carry >= interval) {
        const advance = Math.floor(carry / interval);
        carry -= advance * interval;
        cursor.current = Math.min(total, cursor.current + advance);
        setRevealed(cursor.current);
        if (cursor.current >= total) {
          finish();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('keydown', finish);
    window.addEventListener('pointerdown', finish);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', finish);
      window.removeEventListener('pointerdown', finish);
    };
    // `key` restarts the reveal for a new answer of the same length.
  }, [canAnimate, total, key]);

  return { revealed, streaming: revealed < total };
}

/** Characters of one claim that are showing, given where it starts in the answer. */
export function claimReveal(offset: number, length: number, revealed: number): number {
  return Math.max(0, Math.min(length, revealed - offset));
}
