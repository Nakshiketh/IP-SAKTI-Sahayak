import { Check, TriangleAlert } from 'lucide-react';
import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

/**
 * Form parts for the assessment.
 *
 * The contract is the one the rest of the product keeps: a real label, never a
 * placeholder standing in for one; a hint and an error joined to the control by
 * `aria-describedby`; an invalid control marked `aria-invalid`. Option cards are
 * native radios and checkboxes under the paint, so arrow keys, Space and form
 * semantics come for free.
 */

const INPUT =
  'w-full rounded-control border bg-surface px-3 py-2 text-base text-ink placeholder:text-muted ' +
  'transition-colors duration-quick ease-incise hover:border-ink/60';

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | undefined;
  error?: string | undefined;
  optionalLabel?: string | undefined;
  multiline?: boolean;
  rows?: number;
  autoComplete?: string;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  optionalLabel,
  multiline = false,
  rows = 3,
  autoComplete = 'off',
}: TextFieldProps) {
  const shared = {
    id,
    value,
    autoComplete,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, hint, error),
    className: cn(INPUT, 'mt-2', error ? 'border-lac' : 'border-rule-strong'),
  };

  return (
    <div>
      <label htmlFor={id} className="block text-base font-medium text-ink">
        {label}
        {optionalLabel ? (
          <span className="ml-1.5 text-xs font-normal text-muted">({optionalLabel})</span>
        ) : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea
          rows={rows}
          {...shared}
          className={cn(shared.className, 'resize-y')}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input type="text" {...shared} onChange={(event) => onChange(event.target.value)} />
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-lac">
      {message}
    </p>
  );
}

/**
 * A group of options with one legend. The fieldset takes the id the error
 * summary links to, and can take focus so the link has somewhere to land.
 */
export function ChoiceGroup({
  id,
  legend,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  legend: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={describedBy(id, hint, error)}
      className="m-0 min-w-0 border-0 p-0"
    >
      <legend className="p-0 text-base font-medium text-ink">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={id} message={error} />
      <div className={cn('mt-3 grid gap-2.5', className)}>{children}</div>
    </fieldset>
  );
}

/** One option. Selection changes colour and the mark; nothing lifts or glows. */
export function ChoiceCard({
  type,
  name,
  checked,
  onChange,
  label,
  detail,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  detail?: string | undefined;
}) {
  return (
    <label
      className={cn(
        'flex min-h-[44px] cursor-pointer items-start gap-3 rounded-control border px-3.5 py-3',
        'transition-colors duration-quick ease-incise',
        'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-stamp',
        checked ? 'border-leaf bg-leaf/[0.06]' : 'border-rule-strong bg-surface hover:border-ink/50',
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center border transition-colors duration-quick ease-incise',
          type === 'radio' ? 'rounded-seal' : 'rounded-data',
          checked ? 'border-leaf bg-leaf' : 'border-rule-strong bg-surface',
        )}
      >
        {checked ? (
          type === 'radio' ? (
            <span className="h-1.5 w-1.5 rounded-seal bg-bone" />
          ) : (
            <Check size={12} strokeWidth={3} className="text-bone" />
          )
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-medium leading-snug text-ink">{label}</span>
        {detail ? <span className="mt-0.5 block text-xs text-muted">{detail}</span> : null}
      </span>
    </label>
  );
}

/**
 * What stopped a step from moving on, listed at the top and focused, with each
 * item linking to its field. The inline errors stay where they are.
 */
export const ErrorSummary = forwardRef<
  HTMLDivElement,
  { title: string; items: { id: string; message: string }[] }
>(function ErrorSummary({ title, items }, ref) {
  if (items.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="mb-6 rounded-control border border-lac bg-lac/[0.05] p-3.5"
    >
      <p className="flex max-w-none items-center gap-2 text-base font-medium text-lac">
        <TriangleAlert size={16} aria-hidden="true" className="shrink-0" />
        {title}
      </p>
      <ul className="m-0 mt-2 list-none space-y-1 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(item.id)?.focus();
              }}
              className="rounded-data text-base text-lac underline underline-offset-4"
            >
              {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
