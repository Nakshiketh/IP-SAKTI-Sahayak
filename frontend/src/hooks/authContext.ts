import { createContext, useContext } from 'react';

import type { Member } from '@/services/auth';

/**
 * The session, and what anyone does with it.
 *
 * Context and hook live here, apart from the provider in `useAuth.tsx`, because
 * a module that exports both a component and a plain value breaks React Fast
 * Refresh: an edit to either forces a full reload instead of a hot swap.
 *
 * - `checking`: the server has not answered yet. Nothing is rendered, so no
 *   page content flashes before a reader is sent to the portal.
 * - `restricted`: signed in on a temporary password; only the create-password
 *   step is reachable.
 */
export type AuthStatus = 'checking' | 'anonymous' | 'restricted' | 'authenticated';

/** Why the reader is at the portal, when it is worth telling them. */
export type AuthNotice = 'loggedOut' | 'expired' | 'unreachable' | 'passwordUpdated' | null;

export interface AuthContextValue {
  status: AuthStatus;
  user: Member | null;
  notice: AuthNotice;
  /** Ask the server again who is signed in, after a sign-in or password change. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an <AuthProvider>');
  return value;
}
