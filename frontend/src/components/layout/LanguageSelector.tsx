import { Globe } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { changeLanguage } from '@/i18n';
import {
  findLocale,
  INDIAN_LOCALES,
  INTERNATIONAL_LOCALES,
  isFullyTranslated,
  LOCALE_STATUS,
} from '@/i18n/languages';
import { cn } from '@/lib/cn';

/**
 * Language, named in its own script.
 *
 * A reader looking for Telugu is looking for తెలుగు, not for the word "Telugu"
 * spelled in Latin. Each option is written the way its speakers write it, and the
 * option element carries its own `lang` so the right face is used per row.
 *
 * A native select, for the reasons in the Select primitive: it is
 * keyboard-complete, screen-reader-complete and works on a phone.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('common');
  const id = useId();
  const current = findLocale(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      <Globe size={16} aria-hidden="true" className="shrink-0 text-muted" />
      <label htmlFor={id} className="absolute h-px w-px overflow-hidden [clip:rect(0,0,0,0)]">
        {t('language.label')}
      </label>
      <select
        id={id}
        value={current.code}
        lang={current.code}
        onChange={(event) => changeLanguage(event.target.value)}
        className={cn(
          'cursor-pointer rounded-control border border-transparent bg-transparent',
          'py-1 pl-1 pr-1 text-base text-ink',
          'transition-colors duration-quick ease-incise hover:border-rule-strong',
        )}
      >
        {/* Grouped once there were fifteen. A flat list put Korean four rows
            below Marathi with nothing to say why, and buried the Indian
            languages — the ones this product is first of all for — in a list
            mostly of export markets. The group labels are in the reader's own
            language; the options stay in theirs. */}
        <optgroup label={t('language.groupIndian')}>
          {INDIAN_LOCALES.map((locale) => (
            <option key={locale.code} value={locale.code} lang={locale.code}>
              {locale.nativeName}
            </option>
          ))}
        </optgroup>
        <optgroup label={t('language.groupInternational')}>
          {INTERNATIONAL_LOCALES.map((locale) => (
            <option key={locale.code} value={locale.code} lang={locale.code}>
              {locale.nativeName}
            </option>
          ))}
        </optgroup>
      </select>

      {/* How far the language a reader is actually in has been translated,
          said in that language, at the moment it matters. Putting it inside
          the options would have printed English words in every other
          language's own row. */}
      {isFullyTranslated(current.code) ? null : (
        <span className="text-xs text-muted">
          {t('language.partial', {
            percent: Math.round((LOCALE_STATUS[current.code]?.coverage ?? 0) * 100),
          })}
        </span>
      )}
    </div>
  );
}
