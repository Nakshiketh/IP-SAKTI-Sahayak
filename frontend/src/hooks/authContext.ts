import { createContext, useContext } from 'react';

import type { AuthSession, AuthUser } from '@/services/auth';

/**
 * The session, and the two things anyone does with it.
 *
 * Context and hook live here, apart from the provider in `useAuth.tsx`, because
 * a module that exports both a component and a plain value breaks React Fast
 * Refresh: an edit to either forces a full reload instead of a hot swap.
 */
export type AuthStatus = 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signedIn: (session: AuthSession) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an <AuthProvider>');
  return value;
}
