import { Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Callout } from '@/components/ui';
import type { LocaleCode } from '@/i18n/languages';
import { runQuery } from '@/services/query';
import { sessionId } from '@/services/session';

/**
 * A rehearsal of the helpline, and a label saying so for as long as it is open.
 *
 * This product has no phone number. It cannot receive a call and nothing in the
 * repository talks to a carrier — `services/telephony.py` is the seam where an
 * approved provider would plug in, and its only implementation refuses. What
 * this is, is the conversation such a helpline would have, running on exactly
 * the same pipeline as the text interface so that what a caller would hear can
 * be checked before anyone is asked to fund a phone line.
 *
 * The honesty rules, all visible on screen rather than only here:
 *
 * **It never claims to be a call.** The banner stays up for the whole session,
 * not as a dismissible notice. A demo that looked like a working helpline is
 * precisely the lie this component exists to avoid telling.
 *
 * **The answer is the same answer.** It goes through `runQuery` with
 * `channel: 'helpline'`, which reaches the audit row and nothing else. If the
 * spoken answer ever differed from the typed one, the person least able to
 * notice would be the one who cannot read the screen.
 *
 * **Speech is optional in both directions.** A browser without recognition
 * gets a text box; a reader who does not want to be spoken at can mute. Neither
 * changes what is said.
 */

interface Turn {
  who: 'caller' | 'sahayak';
  text: string;
  at: number;
}

type Recogniser = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognition(): Recogniser | null {
  const holder = window as unknown as { SpeechRecognition?: new () => Recogniser } & {
    webkitSpeechRecognition?: new () => Recogniser;
  };
  const Impl = holder.SpeechRecognition ?? holder.webkitSpeechRecognition;
  return Impl ? new Impl() : null;
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function HelplineSimulator({ language }: { language: LocaleCode }) {
  const { t } = useTranslation('sahayak');
  const [live, setLive] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [typed, setTyped] = useState('');
  const recogniser = useRef<Recogniser | null>(null);
  const canHear = useRef(false);

  useEffect(() => {
    canHear.current = recognition() !== null;
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  /** Speaking is a convenience, never a requirement. A browser without it is
   *  not a browser that gets a worse answer — it gets the same text. */
  const say = useCallback(
    (text: string) => {
      if (!speak || typeof window.speechSynthesis === 'undefined') return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      window.speechSynthesis.speak(utterance);
    },
    [speak, language],
  );

  const ask = useCallback(
    async (question: string) => {
      const asked = question.trim();
      if (!asked) return;
      setTurns((all) => [...all, { who: 'caller', text: asked, at: Date.now() }]);
      setThinking(true);

      try {
        const result = await runQuery(asked, {
          jurisdiction: 'IN',
          sessionId: sessionId(),
          languageOut: language,
          // Recorded, and nothing else. The answer is the answer.
          channel: 'helpline',
        });
        // An abstention is the system working and saying the evidence is too
        // thin. Over a phone line that has to be said out loud as plainly as an
        // answer would be — a caller cannot see an empty screen and infer it.
        const spoken =
          result.answer?.blocks.map((block) => block.text).join(' ') ??
          t(`abstention.${result.confidence.abstainReason ?? 'nothing_relevant'}.title`);
        setTurns((all) => [...all, { who: 'sahayak', text: spoken, at: Date.now() }]);
        say(spoken);
      } catch {
        const failed = t('helpline.failed');
        setTurns((all) => [...all, { who: 'sahayak', text: failed, at: Date.now() }]);
      } finally {
        setThinking(false);
      }
    },
    [language, say, t],
  );

  function listen() {
    const engine = recognition();
    if (!engine) return;
    recogniser.current = engine;
    engine.lang = language;
    engine.continuous = false;
    engine.interimResults = false;
    engine.onresult = (event) => {
      const heard = event.results?.[0]?.[0]?.transcript;
      if (heard) void ask(heard);
    };
    engine.start();
  }

  function start() {
    setLive(true);
    setSeconds(0);
    setTurns([]);
    const greeting = t('helpline.greeting');
    setTurns([{ who: 'sahayak', text: greeting, at: Date.now() }]);
    say(greeting);
  }

  function hangUp() {
    setLive(false);
    recogniser.current?.stop();
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
  }

  const asked = turns.filter((turn) => turn.who === 'caller').length;

  return (
    <section className="mt-6 border-t border-rule pt-5">
      <h2 className="text-base">{t('helpline.heading')}</h2>

      {/* Not dismissible, and not only at the start. A demo that looked like a
          working helpline is the one thing this must never be mistaken for. */}
      <Callout tone="info" title={t('helpline.notAPhoneLine')} className="mt-3">
        {t('helpline.notAPhoneLineBody')}
      </Callout>

      {!live ? (
        <button
          type="button"
          onClick={start}
          className="mt-4 inline-flex items-center gap-2 rounded-control border border-rule-strong px-3 py-2 text-base transition-colors duration-quick hover:border-ink"
        >
          <Phone size={16} aria-hidden="true" />
          {t('helpline.start')}
        </button>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-rule p-3">
            <p className="flex items-center gap-2 text-base">
              <Phone size={16} aria-hidden="true" />
              {t('helpline.inProgress')}
              <span className="tabular-nums text-muted">{clock(seconds)}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSpeak((on) => !on)}
                aria-pressed={speak}
                className="inline-flex items-center gap-1 rounded-control border border-rule px-2 py-1 text-xs"
              >
                {speak ? <Volume2 size={12} /> : <VolumeX size={12} />}
                {speak ? t('helpline.muteVoice') : t('helpline.unmuteVoice')}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="inline-flex items-center gap-1 rounded-control border border-rule-strong px-2 py-1 text-xs"
              >
                <PhoneOff size={12} aria-hidden="true" />
                {t('helpline.end')}
              </button>
            </div>
          </div>

          <ol
            className="m-0 mt-3 max-h-72 list-none space-y-3 overflow-auto p-0"
            aria-live="polite"
            aria-label={t('helpline.transcript')}
          >
            {turns.map((turn) => (
              <li key={`${turn.at}-${turn.who}`} className="border-l-2 border-rule-strong pl-3">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {turn.who === 'caller' ? t('helpline.caller') : t('helpline.sahayak')}
                </p>
                <p className="mt-1 text-base">{turn.text}</p>
              </li>
            ))}
            {thinking ? <li className="pl-3 text-base text-muted">{t('helpline.thinking')}</li> : null}
          </ol>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canHear.current ? (
              <button
                type="button"
                onClick={listen}
                className="rounded-control border border-rule-strong px-3 py-2 text-base"
              >
                {t('helpline.speak')}
              </button>
            ) : null}
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                void ask(typed);
                setTyped('');
              }}
              placeholder={t('helpline.typeInstead')}
              aria-label={t('helpline.typeInstead')}
              className="min-w-0 flex-1 rounded-control border border-rule bg-transparent px-3 py-2 text-base"
            />
          </div>
        </div>
      )}

      {!live && turns.length > 0 ? (
        <div className="mt-4 border border-rule p-3">
          <h3 className="text-base">{t('helpline.summary')}</h3>
          <p className="mt-2 text-base text-muted">
            {t('helpline.summaryBody', { count: asked, duration: clock(seconds) })}
          </p>
          <ol className="m-0 mt-3 list-none space-y-2 p-0">
            {turns
              .filter((turn) => turn.who === 'caller')
              .map((turn) => (
                <li key={turn.at} className="border-l-2 border-rule pl-3 text-base">
                  {turn.text}
                </li>
              ))}
          </ol>
          <p className="mt-3 text-xs text-muted">{t('helpline.summaryNotKept')}</p>
        </div>
      ) : null}
    </section>
  );
}

export default HelplineSimulator;
