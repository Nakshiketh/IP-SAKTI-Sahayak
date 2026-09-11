/**
 * How long the background sound lasts: twice on the sign-in page, and for as
 * long as the footage loops on the site behind it.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioControl } from '@/components/auth/AudioControl';
import { useHeroAudio, type HeroAudioOptions } from '@/hooks/useHeroAudio';

const CLIP = 10;

function Harness(props: HeroAudioOptions) {
  const audio = useHeroAudio(props);
  return (
    <>
      <video ref={audio.videoRef} data-testid="video" />
      <AudioControl {...audio} />
    </>
  );
}

/**
 * Stands in for playback: a clip whose clock the test moves by hand, ticking
 * every 250ms the way `timeupdate` does, and wrapping at the end as `loop` does.
 */
function fakeClock(video: HTMLVideoElement) {
  let time = 0;
  Object.defineProperty(video, 'duration', { configurable: true, get: () => CLIP });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
    },
  });
  return (seconds: number) =>
    act(() => {
      for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) {
        time = (time + 0.25) % CLIP;
        video.dispatchEvent(new Event('timeupdate'));
      }
    });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('background sound', () => {
  it('on the sign-in page, plays the clip twice and then goes quiet', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    const play = fakeClock(video);

    await user.click(screen.getByRole('button', { name: 'Unmute background video' }));
    await screen.findByRole('button', { name: 'Mute background video' });

    play(CLIP * 2 - 0.5);
    expect(video.muted).toBe(false);

    play(0.5);
    expect(video.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Unmute background video' })).toBeInTheDocument();
    expect(sessionStorage.getItem('sahayak.hero.muted')).toBe('true');
  });

  it('on the site, starts with sound and keeps it looping with the footage', async () => {
    render(<Harness storageKey="sahayak.backdrop" soundByDefault playsWithSound={Infinity} />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    const play = fakeClock(video);
    await screen.findByRole('button', { name: 'Mute background video' });

    play(CLIP * 6);
    expect(video.muted).toBe(false);
  });

  it('turns the sound on from a press on the control, when the browser held it back', async () => {
    const user = userEvent.setup();
    // Refused on mount, as after a reload: no gesture yet on this page.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError'),
    );
    render(<Harness storageKey="sahayak.backdrop" soundByDefault playsWithSound={Infinity} />);

    // Silent, and the control says so rather than showing a speaker.
    const control = await screen.findByRole('button', { name: 'Unmute background video' });

    // The press must not also count as the page's first gesture, or the sound
    // would come on and the control's own click would switch it off again.
    await user.click(control);
    await screen.findByRole('button', { name: 'Mute background video' });
    expect((screen.getByTestId('video') as HTMLVideoElement).muted).toBe(false);
  });
});
