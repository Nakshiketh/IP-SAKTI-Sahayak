import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthContext, type AuthContextValue, type AuthStatus } from '@/hooks/authContext';
import {
  clearSession,
  readStoredSession,
  storeSession,
  verifySession,
  type AuthSession,
  type AuthUser,
} from '@/services/auth';

/**
 * Who is signed in, for the whole app.
 *
 * A stored session is trusted immediately and checked in the background, rather
 * than the app holding its render until the server answers. The alternative was
 * a third `checking` state that rendered nothing, and it was the wrong trade: it
 * blanks the page on every load, for everyone, to avoid briefly showing the site
 * to the rare reader whose token expired since their last visit — and that
 * reader is stopped by the API on their first real request anyway.
 *
 * So the check runs, and its only power is to downgrade. See `verifySession`
 * for why an unreachable server is not treated as a rejection.
 */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const stored = useMemo(() => readStoredSession(), []);
  const [status, setStatus] = useState<AuthStatus>(stored ? 'authenticated' : 'anonymous');
  const [user, setUser] = useState<AuthUser | null>(stored?.user ?? null);

  // Confirm a stored token against the server once, on load.
  useEffect(() => {
    if (!stored) return;
    let cancelled = false;

    void (async () => {
      const check = await verifySession(stored.token);
      if (cancelled) return;

      if (check.state === 'invalid') {
        clearSession();
        setUser(null);
        setStatus('anonymous');
        return;
      }

      // 'valid' refreshes the profile from the server; 'unknown' means the
      // question could not be asked, and the stored session stands until
      // something authoritative says otherwise. Neither promotes anything: the
      // session was already in force before this ran.
      if (check.state === 'valid') setUser(check.user);
    })();

    return () => {
      cancelled = true;
    };
  }, [stored]);

  const signedIn = useCallback((session: AuthSession) => {
    storeSession(session);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, signedIn, signOut }),
    [status, user, signedIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
