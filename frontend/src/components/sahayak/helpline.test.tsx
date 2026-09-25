/**
 * The call rehearsal, and the claim it must never make.
 *
 * This product has no phone number. The whole component is only defensible if a
 * person using it cannot come away believing they reached a helpline — so the
 * label is tested as hard as the behaviour, and it is tested as *persistent*,
 * because a notice shown once and dismissed is a notice nobody read.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HelplineSimulator } from '@/components/sahayak/HelplineSimulator';

afterEach(() => vi.unstubAllGlobals());

function renderCall() {
  return render(<HelplineSimulator language="en" />);
}

async function startCall() {
  await userEvent.click(screen.getByRole('button', { name: /start the rehearsal/i }));
}

describe('the helpline rehearsal', () => {
  it('says no phone service is connected, before anything starts', () => {
    renderCall();
    expect(screen.getByText(/no phone service is connected/i)).toBeInTheDocument();
  });

  it('keeps saying it for the whole session', async () => {
    renderCall();
    await startCall();

    // Not dismissible and not only at the start: a demo that looked like a
    // working helpline is the one thing this must never be mistaken for.
    expect(screen.getByText(/no phone service is connected/i)).toBeInTheDocument();
    expect(screen.getByText(/has no phone number/i)).toBeInTheDocument();
  });

  it('never claims to be dialling anyone', () => {
    const { container } = renderCall();
    const text = container.textContent?.toLowerCase() ?? '';
    for (const forbidden of ['calling', 'dialling', 'dialing', 'connecting you', 'ringing']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('opens with a greeting that states the limit it will not cross', async () => {
    renderCall();
    await startCall();
    // The refusal a caller is most likely to need, said before they ask.
    expect(screen.getByText(/cannot give medical or dosage advice/i)).toBeInTheDocument();
  });

  it('runs a timer once the rehearsal starts', async () => {
    renderCall();
    await startCall();
    expect(screen.getByText(/00:0\d/)).toBeInTheDocument();
  });

  it('answers a typed question through the ordinary pipeline', async () => {
    renderCall();
    await startCall();

    const box = screen.getByRole('textbox', { name: /caller would say/i });
    await userEvent.type(box, 'Can a classical formulation be patented?{Enter}');

    await waitFor(() =>
      expect(screen.getByText('Can a classical formulation be patented?')).toBeInTheDocument(),
    );
  });

  it('offers typing when the browser cannot hear', () => {
    renderCall();
    // No SpeechRecognition is stubbed, so the spoken path is absent and the
    // typed one is not. A caller without speech is not a caller without access.
    expect(screen.queryByRole('button', { name: /hold to speak/i })).not.toBeInTheDocument();
  });

  it('records no audio at any point', async () => {
    const recorder = vi.fn();
    vi.stubGlobal('MediaRecorder', recorder);

    renderCall();
    await startCall();
    expect(recorder).not.toHaveBeenCalled();
  });

  it('gives a summary afterwards and says it is not kept', async () => {
    renderCall();
    await startCall();

    const box = screen.getByRole('textbox', { name: /caller would say/i });
    await userEvent.type(box, 'Can we register our brand name?{Enter}');
    await waitFor(() => expect(screen.getByText('Can we register our brand name?')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /^end$/i }));
    expect(screen.getByText(/after the call/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing from this rehearsal is stored/i)).toBeInTheDocument();
  });

  it('can be muted without changing what is said', async () => {
    renderCall();
    await startCall();

    const mute = screen.getByRole('button', { name: /mute/i });
    expect(mute).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(mute);

    // The greeting is still on screen. Muting silences the voice, not the
    // answer — a reader who turns off speech is not a reader told less.
    expect(screen.getByText(/cannot give medical or dosage advice/i)).toBeInTheDocument();
  });
});
