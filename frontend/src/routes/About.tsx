import { useTranslation } from 'react-i18next';

import { PageShell } from '@/components/layout/PageIntro';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

export default function About() {
  const { t } = useTranslation('about');
  useDocumentMeta(t('meta.title'), t('meta.description'));

  return (
    <PageShell>
      <h1 className="text-2xl">{t('heading')}</h1>
      <p className="mt-4 max-w-measure text-md">{t('opening')}</p>
    </PageShell>
  );
}
