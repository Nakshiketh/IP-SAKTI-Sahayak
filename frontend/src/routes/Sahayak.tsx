import { useTranslation } from 'react-i18next';

import { PageIntro, PageShell } from '@/components/layout/PageIntro';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/** The workspace itself is Phase 7; the answer surface is Phase 8. */
export default function Sahayak() {
  const { t } = useTranslation('sahayak');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <PageShell>
      <PageIntro heading={t('heading')} standfirst={t('standfirst')} />
    </PageShell>
  );
}
