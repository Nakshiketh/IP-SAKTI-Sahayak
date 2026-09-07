import { useTranslation } from 'react-i18next';

import { PageIntro, PageShell } from '@/components/layout/PageIntro';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

/** The rights, regulation and ABS sections are Phase 4. */
export default function WhatIsCovered() {
  const { t } = useTranslation('covered');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <PageShell>
      <PageIntro heading={t('heading')} standfirst={t('standfirst')} />
    </PageShell>
  );
}
