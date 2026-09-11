import { Volume2, VolumeX } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeroAudio } from '@/hooks/useHeroAudio';

/**
 * Mute toggle and volume, in the corner of the hero.
 *
 * The icon-only button carries an `aria-label` naming the action and
 * `aria-pressed` carrying the state, because either alone leaves a gap: the
 * label says what pressing it does, the state says what it is doing now.
 *
 * The slider is a real `<input type="range">` with a real label, so arrow keys
 * adjust it without a line of code. It is revealed on hover or focus rather
 * than shown permanently — `focus-within` is what keeps it reachable by
 * keyboard once it is visually hidden.
 */
export function AudioControl({
  muted,
  volume,
  blocked,
  toggleMuted,
  setVolume,
  className = '',
}: HeroAudio & { className?: string }) {
  const sliderId = useId();
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  // A refused unmute is silence, whatever the preference says; show what is heard.
  const silent = muted || blocked;

  return (
    <div
      // Marks the control for `useHeroAudio`, which leaves presses here to it.
      data-audio-control=""
      className={`flex items-center gap-2 ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        // Only close once focus has left the group, or tabbing from the button
        // to the slider would hide the slider mid-tab.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div
        className={`flex items-center overflow-hidden transition-all duration-300 ${
          open ? 'w-28 opacity-100' : 'w-0 opacity-0'
        }`}
      >
        <label htmlFor={sliderId} className="sr-only">
          {t('auth.volume')}
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(event) => setVolume(Number.parseFloat(event.target.value))}
          aria-valuetext={`${Math.round(volume * 100)}%`}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/25
            [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white"
        />
      </div>

      <button
        type="button"
        onClick={toggleMuted}
        aria-label={silent ? t('auth.unmute') : t('auth.mute')}
        aria-pressed={!silent}
        title={blocked ? t('auth.unmute') : undefined}
        className="grid h-11 w-11 place-items-center rounded-full border border-white/25
          bg-black/40 text-white backdrop-blur transition
          hover:border-white/50 hover:bg-black/60
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white
          focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        {silent ? (
          <VolumeX size={19} aria-hidden="true" />
        ) : (
          <Volume2 size={19} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
