import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

/**
 * Speaking a question instead of typing it.
 *
 * Three rules shape this, and all three are about not taking the question out
 * of the asker's hands.
 *
 * The transcript is shown and editable, and **nothing is ever submitted
 * automatically**. Speech recognition mishears, and it mishears domain words
 * worst of all — "Form 18" and "form eighteen" and "form ate teen" are not the
 * same query. Auto-submitting would ask a question the person did not ask, and
 * they would then read an answer to it believing it was theirs.
 *
 * No audio is kept. The browser's recogniser hears it, a transcript comes back,
 * and nothing is stored, uploaded or held after the session. This component
 * never touches a MediaRecorder.
 *
 * Where the browser cannot do speech in the active language, it says so plainly
 * and leaves typing available, rather than offering a microphone that produces
 * nothing.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function recogniser(): SpeechRecognitionLike | null {
  const holder = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Recognition = holder.SpeechRecognition ?? holder.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

export function VoiceInput({
  language,
  onTranscript,
  className,
  showNote = true,
}: {
  language: string;
  /** The words, for the composer to show and the person to correct. */
  onTranscript: (text: string) => void;
  className?: string;
  /**
   * Whether this renders the promise beneath the button.
   *
   * The promise itself is not optional — "nothing is sent until you press Ask,
   * and no audio is kept" has to be somewhere a person reads it. What moves is
   * where. Sitting in the input row the button has no room for a sentence, so
   * the composer renders it under the row instead and passes false here.
   */
  showNote?: boolean;
}) {
  const { t } = useTranslation('sahayak');
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const active = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(recogniser() !== null);
    return () => active.current?.stop();
  }, []);

  function listen() {
    const recognition = recogniser();
    if (!recognition) {
      setSupported(false);
      return;
    }
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript;
      // Handed to the composer, not to the pipeline. The person submits.
      if (said) onTranscript(said);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    active.current = recognition;
    setListening(true);
    recognition.start();
  }

  if (supported === false) {
    return (
      <p className={cn('text-xs text-muted', className)}>{t('voice.unsupported', { language })}</p>
    );
  }

  const label = listening ? t('voice.listening') : t('voice.speak');

  return (
    <div className={cn('print:hidden', className)}>
      {/* The words became the accessible name rather than disappearing. An
          icon-only control with no label is unusable by anyone reading the
          page through a screen reader, and a microphone glyph is not
          self-explanatory to everyone who can see it either — the title
          carries it on hover, the aria-label everywhere else.

          44px square: the minimum a finger can hit reliably. The listening
          state is carried by a different glyph as well as aria-pressed, so it
          does not depend on noticing a colour. */}
      <button
        type="button"
        onClick={() => (listening ? active.current?.stop() : listen())}
        aria-pressed={listening}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center',
          'rounded-control border text-ink',
          'transition-colors duration-quick ease-incise',
          listening ? 'border-ink bg-surface-sunk' : 'border-rule-strong hover:border-ink',
        )}
      >
        {listening ? <Square size={16} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
      </button>
      {showNote ? <p className="mt-1.5 text-xs text-muted">{t('voice.note')}</p> : null}
    </div>
  );
}

export default VoiceInput;
