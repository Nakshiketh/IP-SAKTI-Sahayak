import { Check, Globe, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { changeLanguage } from '@/i18n';
import {
  findLocale,
  LOCALES,
  isFullyTranslated,
  LOCALE_STATUS,
  type LocaleDefinition,
} from '@/i18n/languages';
import { cn } from '@/lib/cn';

/**
 * Language selector with search, grouped by India and International.
 *
 * Replaces the native <select> with a custom dropdown that shows native name
 * plus English name for each language, groups them under India / International
 * headings, and includes a search bar to filter through ~67 languages.
 *
 * Keyboard accessible: Escape closes, ArrowDown/Up navigate, Enter selects.
 * Clicking outside closes. Focus is trapped inside the panel when open.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('common');
  const id = useId();
  // The reader's choice, not what fallback resolved to — otherwise the
  // switcher shows "English" while the page is in their language.
  const current = findLocale(i18n.language ?? i18n.resolvedLanguage);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Filter locales by search term (matches native name or English name). */
  const filterLocales = useCallback(
    (locales: readonly LocaleDefinition[]) => {
      if (!search.trim()) return [...locales];
      const q = search.toLowerCase().trim();
      return locales.filter(
        (locale) =>
          locale.nativeName.toLowerCase().includes(q) ||
          locale.englishName.toLowerCase().includes(q) ||
          locale.code.toLowerCase().includes(q),
      );
    },
    [search],
  );

  // One list, in the alphabetical order LOCALES is already kept in. The
  // grouping this replaced answered "which group is mine in", which is not the
  // question a reader of a sixty-seven-item list with a search box is asking.
  const filtered = useMemo(() => filterLocales(LOCALES), [filterLocales]);

  const flatList = filtered;

  /** Close on outside click. */
  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  /** Focus the search input when opening. */
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
      setFocusIndex(-1);
    }
  }, [open]);

  /** Scroll focused item into view. */
  useEffect(() => {
    if (focusIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-locale-item]');
    items[focusIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex]);

  function handleSelect(locale: LocaleDefinition) {
    changeLanguage(locale.code);
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        setSearch('');
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, flatList.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (focusIndex >= 0 && focusIndex < flatList.length) {
          handleSelect(flatList[focusIndex]!);
        }
        break;
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t('language.label')}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5',
          'rounded-control border border-transparent bg-transparent',
          'px-2 py-1 text-base text-ink',
          'transition-colors duration-quick ease-incise hover:border-rule-strong',
        )}
      >
        <Globe size={16} aria-hidden="true" className="shrink-0 text-muted" />
        <span lang={current.code}>{current.nativeName}</span>
      </button>

      {/* How far the language a reader is actually in has been translated,
          said in that language, at the moment it matters. */}
      {isFullyTranslated(current.code) ? null : (
        <span className="ml-1 text-xs text-muted">
          {t('language.partial', {
            percent: Math.round((LOCALE_STATUS[current.code]?.coverage ?? 0) * 100),
          })}
        </span>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('language.selectTitle')}
          onKeyDown={handleKeyDown}
          className={cn(
            'absolute right-0 top-full z-50 mt-2',
            'w-[340px] max-h-[480px]',
            'rounded-lg border border-rule bg-surface shadow-xl',
            'flex flex-col overflow-hidden',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <h2 className="text-base font-semibold text-ink">
              {t('language.selectTitle')}
            </h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSearch('');
              }}
              aria-label={t('actions.close')}
              className={cn(
                'rounded-full p-1 text-muted',
                'transition-colors hover:bg-rule hover:text-ink',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {/* Search */}
          <div className="border-b border-rule px-4 py-2">
            <div className="flex items-center gap-2 rounded-lg bg-rule/40 px-3 py-2">
              <Search size={16} aria-hidden="true" className="shrink-0 text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setFocusIndex(-1);
                }}
                placeholder={t('language.searchPlaceholder')}
                aria-label={t('language.searchPlaceholder')}
                className={cn(
                  'w-full bg-transparent text-sm text-ink',
                  'placeholder:text-muted',
                  'outline-none',
                )}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  aria-label={t('language.clearSearch')}
                  className="rounded-full p-0.5 text-muted hover:text-ink"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Language list */}
          <div ref={listRef} role="listbox" className="flex-1 overflow-y-auto overscroll-contain">
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">
                {t('language.noResults')}
              </p>
            )}

            {filtered.map((locale, index) => (
              <LanguageItem
                key={locale.code}
                locale={locale}
                isActive={locale.code === current.code}
                isFocused={index === focusIndex}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A single language row in the dropdown. */
function LanguageItem({
  locale,
  isActive,
  isFocused,
  onSelect,
}: {
  locale: LocaleDefinition;
  isActive: boolean;
  isFocused: boolean;
  onSelect: (locale: LocaleDefinition) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isFocused) ref.current?.focus();
  }, [isFocused]);

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      data-locale-item
      aria-selected={isActive}
      onClick={() => onSelect(locale)}
      lang={locale.code}
      className={cn(
        'flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left',
        'transition-colors duration-quick',
        'hover:bg-rule/50 focus-visible:bg-rule/50',
        'focus-visible:outline-none',
        isActive && 'bg-accent/10',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-medium', isActive ? 'text-accent' : 'text-ink')}>
          {locale.nativeName}
        </div>
        <div className="text-xs text-muted">{locale.englishName}</div>
      </div>
      {isActive && (
        <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
      )}
    </button>
  );
}
