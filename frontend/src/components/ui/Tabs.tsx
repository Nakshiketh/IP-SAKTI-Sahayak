import { useRef } from 'react';

import { cn } from '@/lib/cn';

/**
 * Tabs with a roving tabindex: one stop in the tab order, arrow keys to move
 * between panels. Home and End jump to the ends.
 *
 * Sources and related records are separate tabs precisely because they must never
 * appear in one list — the tab boundary is the separation.
 */
export interface TabItem {
  id: string;
  label: string;
  /** Optional count, e.g. the number of sources behind the tab. */
  count?: number;
}

interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  /**
   * Shared with the matching <TabPanel>s so each panel is labelled by its tab.
   * Required rather than generated internally: a Tabs that mints its own id
   * cannot tell its panels what that id was, and the association silently fails.
   */
  idBase: string;
  className?: string;
  'aria-label': string;
}

export function Tabs({ items, value, onChange, idBase, className, ...aria }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: React.KeyboardEvent) {
    const index = items.findIndex((item) => item.id === value);
    if (index === -1) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={aria['aria-label']}
      onKeyDown={onKeyDown}
      className={cn('flex gap-4 border-b border-rule', className)}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[item.id] = node;
            }}
            role="tab"
            id={`${idBase}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2 text-base transition-colors duration-quick ease-incise',
              selected
                ? 'border-leaf text-ink'
                : 'border-transparent text-muted hover:border-rule-strong hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className="ml-1.5 text-xs text-muted">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  id,
  idBase,
  active,
  children,
}: {
  id: string;
  /** The same value passed to <Tabs>. */
  idBase: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${id}`}
      aria-labelledby={`${idBase}-tab-${id}`}
      hidden={!active}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
