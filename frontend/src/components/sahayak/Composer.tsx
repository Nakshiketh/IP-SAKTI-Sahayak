import { forwardRef, lazy, Suspense, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Disclosure, Select } from '@/components/ui';
import { FEATURES } from '@/config/features';
import { LOCALES, type LocaleCode } from '@/i18n/languages';
import { detectScript } from '@/lib/detectScript';
import { cn } from '@/lib/cn';

/**
 * The one control a first-time reader has to use.
 *
 * Nothing above it must be answered before it works: the jurisdiction defaults
 * to India, the language is read off the script as you type, and the product
 * type stays unknown until it matters. Zero decisions before the first answer.
 *
 * The detected language is shown and correctable rather than silently applied.
 * Where the script cannot decide — Devanagari carries both Hindi and Marathi —
 * it says which languages it is between instead of picking one.
 */
/**
 * Speaking is loaded on demand, not bundled.
 *
 * Almost nobody uses it, and the people who do decide to before they need it.
 * Keeping it out of the first load means a reader on a slow connection is not
 * paying for a microphone they will never tap.
 */
const VoiceInput = lazy(() => import('@/components/sahayak/VoiceInput'));

/**
 * Lazy for the same reason, and more so: this pulls in a file reader and a
 * whole upload surface for something most questions never need. It is also the
 * larger of the two, so keeping it out of the first load matters more.
 */
const DocumentUpload = lazy(() => import('@/components/sahayak/DocumentUpload'));

/** The call rehearsal. Lazy for the same reason as the other two. */
const HelplineSimulator = lazy(() => import('@/components/sahayak/HelplineSimulator'));

interface ComposerProps {
  onSubmit: (question: string) => void;
  language: LocaleCode;
  languageOverridden: boolean;
  onLanguageChange: (language: LocaleCode) => void;
  onDetected: (language: LocaleCode) => void;
  onSlash?: () => void;
  className?: string;
}

export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { onSubmit, language, languageOverridden, onLanguageChange, onDetected, onSlash, className },
  ref,
) {
  const { t } = useTranslation('sahayak');
  const [question, setQuestion] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const id = useId();

  const detection = useMemo(() => detectScript(question), [question]);

  function onChange(value: string) {
    setQuestion(value);
    const next = detectScript(value);
    if (next.decided && !languageOverridden) onDetected(next.language);
  }

  function submit() {
    const trimmed = question.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setQuestion('');
  }

  return (
    <div className={cn('w-full', className)}>
      <label htmlFor={id} className="block text-xs text-muted">
        {t('composer.label')}
      </label>
      <div className="mt-1.5 flex items-stretch gap-2">
        <textarea
          id={id}
          ref={ref}
          rows={2}
          value={question}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
            // "/" opens the examples, but only from an empty box — otherwise it
            // would fight anyone typing a date or a fraction.
            if (event.key === '/' && question.length === 0 && onSlash) {
              event.preventDefault();
              onSlash();
            }
          }}
          placeholder={t('composer.placeholder')}
          className={cn(
            'min-h-[3.5rem] flex-1 resize-y rounded-control border border-rule-strong bg-surface',
            'px-3 py-2 text-base text-ink placeholder:text-ink/45',
            'transition-colors duration-quick ease-incise hover:border-ink/60',
          )}
        />
        {/* In the row with the box and the Ask button, because that is where
            the controls for asking belong — a reader looking for a microphone
            looks beside the thing they would speak into, not in a paragraph
            underneath it. Self-stretch keeps it the height of the box, so the
            three line up on both edges at every width. */}
        {FEATURES.voice ? (
          <Suspense fallback={null}>
            <VoiceInput
              className="flex shrink-0 items-stretch self-stretch [&>button]:h-auto [&>button]:self-stretch"
              language={language}
              onTranscript={(said) =>
                setQuestion((current) => (current ? `${current} ${said}` : said))
              }
              showNote={false}
            />
          </Suspense>
        ) : null}

        <Button onClick={submit} className="shrink-0 self-stretch px-5">
          {t('composer.send')}
        </Button>
      </div>

      {/* The promise keeps its place under the row. It moved out of the button
          because a sentence does not fit in a 44px square, not because it
          stopped mattering. */}
      {FEATURES.voice ? <p className="mt-1.5 text-xs text-muted">{t('voice.note')}</p> : null}

      {/* Folded away, and the reason is rhythm rather than tidiness. Both of
          these sit above the answer, so left open they put a file uploader and
          a helpline banner between the reader and the thing they asked for —
          two full sections to scroll past on every result. They are
          alternative ways IN to a question, wanted before one is asked and
          almost never after, so one quiet line holds them until asked for. */}
      {FEATURES.documentIntel || FEATURES.helplineSim ? (
        <Disclosure summary={t('composer.otherWays')} className="mt-3">
          {FEATURES.documentIntel ? (
            <Suspense fallback={null}>
              <DocumentUpload
                onText={(text) =>
                  setQuestion((current) => (current ? `${current}\n\n${text}` : text))
                }
              />
            </Suspense>
          ) : null}

          {FEATURES.helplineSim ? (
            <Suspense fallback={null}>
              <HelplineSimulator language={language} />
            </Suspense>
          ) : null}
        </Disclosure>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {detection.decided ? (
          <p className="max-w-none text-xs text-muted">
            {detection.ambiguousWith.length > 0 && !languageOverridden
              ? t('composer.detectedAmbiguous', {
                  script: languageName(detection.language),
                  languages: [detection.language, ...detection.ambiguousWith]
                    .map(languageName)
                    .join(' / '),
                })
              : t('composer.detected', { language: languageName(language) })}{' '}
            <button
              type="button"
              onClick={() => setCorrecting((open) => !open)}
              aria-expanded={correcting}
              className="rounded-data text-stamp underline underline-offset-4"
            >
              {t('composer.change')}
            </button>
          </p>
        ) : (
          <p className="max-w-none text-xs text-muted">{t('composer.shortcutHint')}</p>
        )}
      </div>

      {correcting ? (
        <div className="mt-2 flex flex-wrap items-end gap-3 rounded-control border border-rule bg-surface-sunk p-3">
          <Select
            label={t('context.changeLanguage')}
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as LocaleCode)}
            options={LOCALES.map((locale) => ({
              value: locale.code,
              label: locale.nativeName,
            }))}
          />
          <p className="max-w-measure text-xs text-muted">{t('composer.detectionNote')}</p>
        </div>
      ) : null}
    </div>
  );
});

function languageName(code: LocaleCode): string {
  return LOCALES.find((locale) => locale.code === code)?.nativeName ?? code;
}
