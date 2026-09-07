import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { cn } from '@/lib/cn';

/**
 * The product, on the homepage.
 *
 * Not a call to action pointing at the product — the product itself. A reader
 * types a question here and lands on the workspace with it already running, so
 * the first thing they experience is an answer rather than a description of one.
 *
 * There is deliberately no second call to action beside it. Two controls of
 * similar weight means a reader has to choose, and choosing is the thing this
 * page is trying to avoid asking them to do.
 */
export function QuestionBox({ className }: { className?: string }) {
  const { t } = useTranslation('home');
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const id = useId();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    navigate(`/sahayak?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={onSubmit} className={cn('max-w-measure', className)}>
      <label htmlFor={id} className="block text-xs text-muted">
        {t('hero.questionLabel')}
      </label>
      <div className="mt-1.5 flex items-stretch gap-2">
        <input
          id={id}
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('hero.questionPlaceholder')}
          className={cn(
            'min-w-0 flex-1 rounded-control border border-rule-strong bg-surface',
            'px-3 py-2.5 text-base text-ink placeholder:text-ink/45',
            'transition-colors duration-quick ease-incise hover:border-ink/60',
          )}
        />
        <button
          type="submit"
          className={cn(
            'inline-flex shrink-0 items-center rounded-control border border-leaf bg-leaf',
            'px-4 text-base font-medium text-bone',
            'transition-colors duration-quick ease-incise hover:border-ink hover:bg-ink',
          )}
        >
          {t('hero.submit')}
        </button>
      </div>
    </form>
  );
}
