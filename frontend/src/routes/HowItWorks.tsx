import { useTranslation } from 'react-i18next';

import { PageIntro, PageShell } from '@/components/layout/PageIntro';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/** The pipeline diagram, abstention states and evaluation numbers are Phase 5. */
export default function HowItWorks() {
  const { t } = useTranslation('howitworks');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <PageShell>
      <PageIntro heading={t('heading')} standfirst={t('standfirst')} />
    </PageShell>
  );
}
