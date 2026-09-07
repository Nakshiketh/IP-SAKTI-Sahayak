import { useTranslation } from 'react-i18next';

import { PageShell } from '@/components/layout/PageIntro';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/**
 * Phase 2 puts the headline and the sentence beneath it in place. The working
 * question box, the worked example, the coverage panels, the rendered answer and
 * the language cards are Phase 3.
 */
export default function Home() {
  const { t } = useTranslation('home');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <PageShell>
      <h1 className="text-3xl">
        <span className="block">{t('hero.line1')}</span>
        <span className="block">{t('hero.line2')}</span>
        <span className="block">{t('hero.line3')}</span>
      </h1>
      <p className="mt-6 max-w-measure text-md">{t('hero.standfirst')}</p>
    </PageShell>
  );
}
