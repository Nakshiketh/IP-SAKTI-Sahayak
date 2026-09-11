import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A labelled input on the dark hero.
 *
 * Its own component rather than the app's field styles, because everything else
 * in this product sits on paper and this one sits on video: the borders,
 * placeholder and focus ring all have to work against a moving image.
 *
 * The accessibility contract is the same one the rest of the app keeps. A real
 * `<label for>`, never a placeholder standing in for one. An invalid field is
 * marked `aria-invalid` and joined to its message by `aria-describedby`, and
 * the message carries `role="alert"` so it is announced when it appears.
 */
interface AuthFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  // `| undefined` on each: this project builds with
  // `exactOptionalPropertyTypes`, so an omitted prop and a prop passed as
  // undefined are different types, and callers pass the latter.
  error?: string | undefined;
  autoComplete?: string | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  autoFocus?: boolean | undefined;
}

export function AuthField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
  disabled,
  autoFocus,
}: AuthFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const { t } = useTranslation('common');

  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-white/80">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`w-full rounded-data border bg-black/30 px-3.5 py-2.5 text-base text-white
            placeholder-white/35 transition
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70
            disabled:opacity-60
            ${isPassword ? 'pr-11' : ''}
            ${error ? 'border-[#FFA898]' : 'border-white/20 hover:border-white/35'}`}
        />

        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={revealed}
            disabled={disabled}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-data p-2
              text-white/55 transition hover:bg-white/10 hover:text-white
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {revealed ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-[#FFA898]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A whole-form error, above the fields. */
export function AuthFormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-data border border-[#FFA898]/45 bg-[#FFA898]/10 px-3.5 py-2.5
        text-base text-[#FFC9BE]"
    >
      {message}
    </div>
  );
}

/** The pending indicator inside a button. Hidden from assistive tech, which
 *  hears the button's own changed label and the form's live region instead. */
export function AuthSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
