import { useTranslation } from 'react-i18next';

import { PageIntro, PageShell } from '@/components/layout/PageIntro';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/** Driven by the corpus manifests in Phase 6. There is no manifest yet. */
export default function Sources() {
  const { t } = useTranslation('sources');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <PageShell>
      <PageIntro heading={t('heading')} standfirst={t('standfirst')} />
    </PageShell>
  );
}
