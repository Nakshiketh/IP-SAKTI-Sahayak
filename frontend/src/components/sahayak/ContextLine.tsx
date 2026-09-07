import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { LOCALES, type LocaleCode } from '@/i18n/languages';
import type { Jurisdiction, ProductClass } from '@/types/domain';

/**
 * The entire context interface, until a reader wants more.
 *
 * One quiet line stating what the answer will assume — jurisdiction, answer
 * language, product type — with each part a control. It says what it is doing
 * rather than asking permission first, which is the zero-config rule: the
 * answer assumes India and says so, instead of demanding a choice up front.
 *
 * Three parts is deliberately the whole thing. Anything more belongs in the
 * context rail, which stays collapsed until asked for.
 */
interface ContextLineProps {
  jurisdiction: Jurisdiction;
  language: LocaleCode;
  productClass: ProductClass;
  onEditJurisdiction: () => void;
  onEditLanguage: () => void;
  onEditProduct: () => void;
  className?: string;
}

export function ContextLine({
  jurisdiction,
  language,
  productClass,
  onEditJurisdiction,
  onEditLanguage,
  onEditProduct,
  className,
}: ContextLineProps) {
  const { t } = useTranslation('sahayak');
  const { t: tc } = useTranslation('common');

  const languageName = LOCALES.find((locale) => locale.code === language)?.nativeName ?? language;

  return (
    <p className={cn('max-w-none text-xs text-muted', className)} aria-label={t('context.label')}>
      <ContextPart onClick={onEditJurisdiction} title={t('context.changeJurisdiction')}>
        {tc(`jurisdiction.${jurisdiction}`)}
      </ContextPart>
      {' · '}
      <ContextPart onClick={onEditLanguage} title={t('context.changeLanguage')}>
        {t('context.language', { language: languageName })}
      </ContextPart>
      {' · '}
      <ContextPart onClick={onEditProduct} title={t('context.changeProduct')}>
        {productClass === 'undetermined'
          ? t('context.productUnknown')
          : t('context.productKnown', { productClass: tc(`productClass.${productClass}`) })}
      </ContextPart>
    </p>
  );
}

function ContextPart({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-data underline decoration-dotted decoration-from-font underline-offset-4 hover:text-ink"
    >
      {children}
    </button>
  );
}
