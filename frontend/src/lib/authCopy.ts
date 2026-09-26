import type { TFunction } from 'i18next';

import { AuthError, NETWORK_ERROR, SERVER_ERROR } from '@/services/auth';

/**
 * What a failed sign-in step says. The server writes the member-facing copy
 * for its own refusals; the page words the two failures the server cannot
 * describe — not being reached, and falling over.
 */
export function authMessage(error: unknown, t: TFunction<'common'>): string {
  if (!(error instanceof AuthError)) return t('auth.errGeneric');
  if (error.code === NETWORK_ERROR) return t('auth.unreachable');
  if (error.code === SERVER_ERROR) return t('auth.serverError');
  return error.message || t('auth.errGeneric');
}

/** The four password rules, as the checklist shows them. The server holds the same four. */
export const PASSWORD_RULES = [
  { key: 'ruleLength', test: (value: string) => value.length >= 8 && value.length <= 128 },
  { key: 'ruleUpper', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'ruleLower', test: (value: string) => /[a-z]/.test(value) },
  { key: 'ruleNumber', test: (value: string) => /[0-9]/.test(value) },
] as const;

/** Password refusals the server names by code, each with its own sentence. */
export const PASSWORD_ERROR_CODES = [
  'password_length',
  'password_uppercase',
  'password_lowercase',
  'password_number',
  'password_unchanged',
  'password_is_identifier',
  'password_mismatch',
] as const;
export type PasswordErrorCode = (typeof PASSWORD_ERROR_CODES)[number];

export function isPasswordErrorCode(code: string): code is PasswordErrorCode {
  return (PASSWORD_ERROR_CODES as readonly string[]).includes(code);
}
