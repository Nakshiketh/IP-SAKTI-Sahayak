import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { buttonStyles } from '@/components/ui';

/**
 * One way into the hard case, for someone with three minutes.
 *
 * The question is fetched from the API rather than written into this file, and
 * then asked through the ordinary route. Nothing here holds an answer, and
 * nothing here can hold one: the component navigates to the workspace with a
 * question, and the workspace calls the same endpoint any other question does.
 * A demo that could show a stored result would prove nothing.
 *
 * If the fetch fails, the real error is shown. A demo that silently fell back
 * to a canned case would be the exact thing this is built to avoid.
 */
/**
 * The case, if the API is offering one.
 *
 * Fetched once rather than probed and then fetched again: the backend decides
 * whether the demo exists, and asking it directly means this bundle cannot
 * disagree with it by carrying a stale flag. `null` while the answer is
 * unknown, so the band never appears and then vanishes under a reader who was
 * about to press it.
 */
function useFlagshipCase(): { question: string } | null {
  const [demoCase, setCase] = useState<{ question: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/demo/flagship-case')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { question?: string } | null) => {
        if (!cancelled && body?.question) setCase({ question: body.question });
      })
      .catch(() => {
        // No demo on this deployment. The band simply does not appear.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return demoCase;
}

export function JuryDemo({ heading, standfirst }: { heading: string; standfirst: string }) {
  const { t } = useTranslation('home');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const demoCase = useFlagshipCase();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Re-read it at the moment of asking, so a case edited since the page
      // loaded is the one that runs.
      const response = await fetch('/api/v1/demo/flagship-case');
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const body = (await response.json()) as { question: string };
      navigate(`/sahayak?q=${encodeURIComponent(body.question)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }

  if (!demoCase) return null;

  return (
    <section aria-labelledby="jury-demo-heading" className="border-t border-rule bg-surface-sunk">
      <div className="mx-auto max-w-[75rem] px-5 py-10">
        <h2 id="jury-demo-heading" className="text-xl">
          {heading}
        </h2>
        <p className="mt-3 max-w-measure text-md">{standfirst}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={run}
            disabled={loading}
            className={buttonStyles({ variant: 'primary' })}
          >
            {loading ? t('juryDemo.running') : t('juryDemo.run')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/sahayak')}
            className={buttonStyles({ variant: 'secondary' })}
          >
            {t('juryDemo.clear')}
          </button>
        </div>
        <p className="mt-2 max-w-measure text-xs text-muted">{t('juryDemo.note')}</p>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-lac">
            {t('juryDemo.failed', { error })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
