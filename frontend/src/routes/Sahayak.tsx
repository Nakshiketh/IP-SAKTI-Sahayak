import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { AnswerView } from '@/components/answer';
import { PageShell } from '@/components/layout/PageIntro';
import { buttonStyles, Callout } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { DEMO_ANSWERS, DEMO_QUESTION } from '@/services/answers.mock';

/**
 * Phase 3 gives this page just enough to make the homepage's question box real:
 * a question arrives in `?q`, and an answer is rendered for it.
 *
 * The answer is the illustrative one, and the page says so in as many words —
 * there is no retrieval until Phase 10 and no corpus until Phase 11, so any
 * question produces the same example. Pretending otherwise would be the one
 * thing this product must never do.
 *
 * The workspace proper — the jurisdiction toggle, the sources panel, starter
 * questions, the context line, keyboard shortcuts — is Phase 7.
 */
export default function Sahayak() {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  const [params] = useSearchParams();
  const question = params.get('q')?.trim();

  return (
    <PageShell>
      <div className="border-b border-rule pb-6">
        <h1 className="text-2xl">{t('heading')}</h1>
        <p className="mt-3 text-md text-muted">{t('standfirst')}</p>
      </div>

      {question ? (
        <section className="mt-8">
          <p className="text-xs text-muted">{t('questionLabel')}</p>
          <p className="mt-1 max-w-measure text-md">{question}</p>

          <Callout tone="caution" title={tc('answer.demoChip')} className="mt-6 max-w-measure">
            {t('demoNotice')}
          </Callout>

          <AnswerView
            className="mt-8"
            headingLevel={2}
            answer={DEMO_ANSWERS.IN}
            confidenceReason={tc('confidence.demoReason', {
              count: DEMO_ANSWERS.IN.citations.length,
            })}
          />
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="text-md">{t('emptyHeading')}</h2>
          <p className="mt-2 max-w-measure text-muted">{t('emptyBody')}</p>
          <Link
            to={`/sahayak?q=${encodeURIComponent(DEMO_QUESTION)}`}
            className={buttonStyles({ variant: 'secondary', className: 'mt-5' })}
          >
            {t('tryExample')}
          </Link>
        </section>
      )}
    </PageShell>
  );
}
