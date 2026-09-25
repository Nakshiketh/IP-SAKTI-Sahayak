import { FileText, Upload, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Callout } from '@/components/ui';
import { readDocument, type ReadDocument } from '@/services/documents';

/**
 * Reading a file the person has, so they can ask about what is in it.
 *
 * Three rules shape this, and each is visible on screen rather than only in the
 * code:
 *
 * **The text is shown before anything is asked.** A PDF very often yields
 * something other than what the person believed was in it — a scanned page
 * yields nothing at all — and a product that went from upload straight to legal
 * guidance would be answering about text nobody had looked at.
 *
 * **It is labelled as theirs.** Beside a cited passage, a reader must never
 * have to work out which text carries authority and which is their own draft.
 * The label is on the server response, not composed here, so it cannot be
 * dropped by a later edit to this component.
 *
 * **Nothing is stored.** The file is read in memory and the text lives in this
 * component's state until the tab is closed. The copy says so, because a person
 * uploading an unpublished formulation is entitled to know.
 */
export function DocumentUpload({ onText }: { onText: (text: string) => void }) {
  const { t } = useTranslation('sahayak');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'reading' }
    | { kind: 'read'; document: ReadDocument }
    | { kind: 'failed'; message: string }
  >({ kind: 'idle' });

  async function choose(file: File | undefined) {
    if (!file) return;
    setState({ kind: 'reading' });
    const result = await readDocument(file);
    setState(
      result.ok
        ? { kind: 'read', document: result.document }
        : { kind: 'failed', message: result.message },
    );
  }

  function clear() {
    setState({ kind: 'idle' });
    if (input.current) input.current.value = '';
  }

  return (
    <section className="mt-6 border-t border-rule pt-5">
      {/* h2, not h3. The page's only other heading is the h1 above the
          composer, and a screen-reader user navigating by heading meets a
          skipped level as a missing section rather than a style choice. */}
      <h2 className="text-base">{t('document.heading')}</h2>
      <p className="mt-2 max-w-measure text-base text-muted">{t('document.standfirst')}</p>

      <label
        htmlFor={inputId}
        className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-control border border-rule-strong px-3 py-2 text-base transition-colors duration-quick hover:border-ink"
      >
        <Upload size={16} aria-hidden="true" />
        {t('document.choose')}
      </label>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        className="absolute h-px w-px overflow-hidden [clip:rect(0,0,0,0)]"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <p className="mt-2 text-xs text-muted">{t('document.limits')}</p>

      {state.kind === 'reading' ? (
        <p className="mt-4 text-base text-muted">{t('document.reading')}</p>
      ) : null}

      {state.kind === 'failed' ? (
        <Callout tone="caution" title={t('document.failed')} className="mt-4">
          {state.message}
        </Callout>
      ) : null}

      {state.kind === 'read' ? (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="flex items-center gap-2 text-base">
              <FileText size={16} aria-hidden="true" />
              {state.document.filename}
            </p>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-xs text-muted underline underline-offset-2"
            >
              <X size={12} aria-hidden="true" />
              {t('document.remove')}
            </button>
          </div>

          {/* Straight from the server. Composing this string here would put the
              one label that separates a draft from the law inside a component
              somebody could later simplify away. */}
          <p className="mt-3 border-l-2 border-rule-strong pl-3 text-xs uppercase tracking-wide text-muted">
            {state.document.label}
          </p>

          <p className="mt-3 text-xs text-muted">
            {t('document.extracted', {
              characters: state.document.characters,
              pages: state.document.pages ?? 0,
            })}
            {state.document.truncated ? ` ${t('document.truncated')}` : ''}
          </p>

          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap border border-rule p-3 text-xs">
            {state.document.text}
          </pre>

          <button
            type="button"
            onClick={() => onText(state.document.text)}
            className="mt-3 rounded-control border border-rule-strong px-3 py-2 text-base transition-colors duration-quick hover:border-ink"
          >
            {t('document.use')}
          </button>
          <p className="mt-2 text-xs text-muted">{t('document.notStored')}</p>
        </div>
      ) : null}
    </section>
  );
}

export default DocumentUpload;
