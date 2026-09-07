import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { PageShell } from '@/components/layout/PageIntro';
import { buttonStyles } from '@/components/ui';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

export default function NotFound() {
  const { t } = useTranslation('common');
  useDocumentMeta(t('notFound.title'), t('notFound.body'));

  return (
    <PageShell>
      <h1 className="text-2xl">{t('notFound.title')}</h1>
      <p className="mt-3 max-w-measure text-md text-muted">{t('notFound.body')}</p>
      <Link to="/" className={buttonStyles({ variant: 'secondary', className: 'mt-6' })}>
        {t('notFound.action')}
      </Link>
    </PageShell>
  );
}
