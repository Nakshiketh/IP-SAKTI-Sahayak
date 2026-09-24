import { useState } from 'react';
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
export function JuryDemo({ className }: { className?: string }) {
  const { t } = useTranslation('home');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
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

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
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
  );
}
