import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/cn';
import { PASSWORD_RULES } from '@/lib/authCopy';
import { strengthOf } from '@/components/portal/styles';

/**
 * The portal's controls, on the dark sheet.
 *
 * Inputs are 44 px, 6 px radius, a 1 px line and a 2 px white focus ring; every
 * one has a visible label above it. Buttons are 48 px on narrow screens and
 * 44 px from `sm` up. The primary button is herbarium white with ink text
 * (15:1); the secondary is an outline. Neither lifts or glows on hover: the
 * face changes colour, which is all a hover has to say.
 */

/** A refusal or a problem, in words; the colour only reinforces them. */
export function FormError({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="rounded-[6px] border border-[#FFB4A8]/60 bg-[#B42318]/[0.18] px-3 py-2 text-[14px] text-[#FFD9D2]"
    >
      {message}
    </p>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
  disabled,
  autoFocus,
  inputMode,
  describedBy,
}: {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  autoComplete?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputMode?: 'text' | 'email' | 'numeric';
  describedBy?: string;
}) {
  const { t } = useTranslation('common');
  const id = useId();
  const errorId = `${id}-error`;
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[14px] font-medium text-white">
          {label}
        </label>
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((current) => !current)}
            aria-controls={id}
            aria-pressed={shown}
            className="rounded-[2px] px-1 text-[14px] font-medium text-white/85 underline-offset-4
              hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-white"
          >
            {shown ? t('auth.portal.hide') : t('auth.portal.show')}
          </button>
        ) : null}
      </div>
      <input
        id={id}
        name={name}
        type={isPassword && shown ? 'text' : type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode={inputMode}
        spellCheck={false}
        autoCapitalize="none"
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined
        }
        className={cn(
          'mt-1.5 h-11 w-full rounded-[6px] border bg-black/30 px-3 text-[16px] text-white',
          'placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
          'disabled:opacity-60',
          error ? 'border-[#FFB4A8]' : 'border-white/[0.35]',
        )}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-[14px] text-[#FFD9D2]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Six boxes for a six-digit code.
 *
 * `inputmode="numeric"` and `autocomplete="one-time-code"` on the first box, so
 * phones offer the code from the email. Pasting a whole code anywhere fills
 * every box; typing moves forward; Backspace on an empty box moves back. When
 * the sixth digit lands, `onComplete` fires.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  labelId,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  disabled?: boolean;
  labelId: string;
  invalid?: boolean;
}) {
  const { t } = useTranslation('common');
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 6 }, (_, index) => value[index] ?? '');

  function set(next: string, focus: number) {
    const clean = next.replace(/\D/g, '').slice(0, 6);
    onChange(clean);
    boxes.current[Math.min(focus, 5)]?.focus();
    if (clean.length === 6) onComplete(clean);
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex gap-2 sm:gap-3">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={index === 0 ? 6 : 1}
          aria-label={t('auth.portal.digit', { number: index + 1 })}
          aria-invalid={invalid ? true : undefined}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, '');
            if (!typed) return;
            if (typed.length > 1) {
              // A paste, or the phone's one-time-code autofill, into any box.
              set(typed, typed.length);
              return;
            }
            const next = (value.slice(0, index) + typed + value.slice(index + 1)).slice(0, 6);
            set(next, index + 1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace') {
              event.preventDefault();
              if (digit) {
                onChange(value.slice(0, index) + value.slice(index + 1));
              } else if (index > 0) {
                onChange(value.slice(0, index - 1) + value.slice(index));
                boxes.current[index - 1]?.focus();
              }
            } else if (event.key === 'ArrowLeft' && index > 0) {
              boxes.current[index - 1]?.focus();
            } else if (event.key === 'ArrowRight' && index < 5) {
              boxes.current[index + 1]?.focus();
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
            if (pasted) {
              event.preventDefault();
              set(pasted, pasted.length);
            }
          }}
          className={cn(
            'h-14 w-full min-w-0 rounded-[6px] border bg-black/30 text-center text-[28px] font-semibold',
            'text-white tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            'disabled:opacity-60',
            invalid ? 'border-[#FFB4A8]' : 'border-white/[0.35]',
          )}
        />
      ))}
    </div>
  );
}

export function PasswordChecklist({ password, id }: { password: string; id: string }) {
  const { t } = useTranslation('common');
  const { score, label } = strengthOf(password);
  return (
    <div id={id} className="space-y-3">
      <ul
        aria-label={t('auth.rulesHeading')}
        className="grid grid-cols-2 gap-x-3 gap-y-1 text-[14px]"
      >
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <li key={rule.key} className={met ? 'text-[#8FD1A8]' : 'text-white/[0.78]'}>
              {met ? (
                <Check size={14} aria-hidden="true" className="mr-1.5 inline-block align-[-2px]" />
              ) : (
                <Minus size={14} aria-hidden="true" className="mr-1.5 inline-block align-[-2px]" />
              )}
              {t(`auth.${rule.key}`)}
              <span className="sr-only">{met ? t('auth.ruleMet') : t('auth.ruleNotMet')}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className={cn(
                'h-1.5 rounded-[2px]',
                segment <= score
                  ? label === 'strong'
                    ? 'bg-[#8FD1A8]'
                    : label === 'fair'
                      ? 'bg-white/80'
                      : 'bg-[#FFB4A8]'
                  : 'bg-white/20',
              )}
            />
          ))}
        </div>
        <p className="w-14 text-right text-[14px] text-white" aria-live="polite">
          {password ? t(`auth.portal.strength.${label}`) : ''}
        </p>
      </div>
    </div>
  );
}
