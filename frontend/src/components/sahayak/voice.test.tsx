/**
 * Speaking a question, and the two things that must stay true about it.
 *
 * Nothing is submitted for the person: speech recognition mishears domain words
 * worst of all, and an auto-submitted mishearing asks a question they did not
 * ask and then shows them an answer to it. And no audio is kept — the browser
 * hears it, a transcript comes back, and nothing else happens.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceInput } from '@/components/sahayak/VoiceInput';

class FakeRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  static started = 0;
  static stopped = 0;

  start() {
    FakeRecognition.started += 1;
  }

  stop() {
    FakeRecognition.stopped += 1;
    this.onend?.();
  }

  say(text: string) {
    this.onresult?.({ results: [[{ transcript: text }]] });
    this.onend?.();
  }
}

let latest: FakeRecognition | null = null;

beforeEach(() => {
  FakeRecognition.started = 0;
  FakeRecognition.stopped = 0;
  latest = null;
  // A factory rather than a subclass: the point is only to keep hold of the
  // instance the component made, so a test can make it "hear" something.
  vi.stubGlobal('SpeechRecognition', function SpeechRecognitionStub(this: unknown) {
    const instance = new FakeRecognition();
    latest = instance;
    return instance;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('speaking a question', () => {
  it('hands the transcript back rather than submitting it', async () => {
    const heard: string[] = [];
    render(<VoiceInput language="en" onTranscript={(text) => heard.push(text)} />);

    await userEvent.click(await screen.findByRole('button', { name: /speak your question/i }));
    latest!.say('can a classical formulation be patented');

    await waitFor(() => expect(heard).toEqual(['can a classical formulation be patented']));
  });

  it('says that nothing is sent until the person presses Ask', async () => {
    render(<VoiceInput language="en" onTranscript={() => {}} />);
    expect(await screen.findByText(/nothing is sent until you press ask/i)).toBeInTheDocument();
  });

  it('says that no audio is kept', async () => {
    render(<VoiceInput language="en" onTranscript={() => {}} />);
    expect(await screen.findByText(/no audio is kept/i)).toBeInTheDocument();
  });

  it('never records audio itself', async () => {
    // A MediaRecorder would mean audio exists somewhere. This component only
    // ever asks the browser's recogniser for words.
    const recorder = vi.fn();
    vi.stubGlobal('MediaRecorder', recorder);

    render(<VoiceInput language="en" onTranscript={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /speak/i }));
    latest!.say('hello');

    expect(recorder).not.toHaveBeenCalled();
  });

  it('asks the recogniser for the language being used', async () => {
    render(<VoiceInput language="hi" onTranscript={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /speak/i }));
    expect(latest!.lang).toBe('hi');
  });

  it('stops when asked, without sending anything', async () => {
    const heard: string[] = [];
    render(<VoiceInput language="en" onTranscript={(text) => heard.push(text)} />);

    await userEvent.click(await screen.findByRole('button', { name: /speak/i }));
    await userEvent.click(screen.getByRole('button', { name: /listening/i }));

    expect(FakeRecognition.stopped).toBe(1);
    expect(heard).toEqual([]);
  });

  it('offers typing when the browser cannot do speech', async () => {
    vi.unstubAllGlobals();
    render(<VoiceInput language="ta" onTranscript={() => {}} />);

    expect(await screen.findByText(/type your question instead/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /speak/i })).not.toBeInTheDocument();
  });
});
