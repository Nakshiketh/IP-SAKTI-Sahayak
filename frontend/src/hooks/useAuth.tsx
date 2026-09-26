import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AuthContext,
  type AuthContextValue,
  type AuthNotice,
  type AuthStatus,
} from '@/hooks/authContext';
import { SESSION_EVENT, type SessionEventDetail } from '@/lib/http';
import { checkSession, logOut, type Member } from '@/services/auth';

/**
 * Who is signed in, for the whole app.
 *
 * The session is an HttpOnly cookie, so the page cannot know it has one until it
 * asks. It asks once on load and renders nothing until the answer arrives: a
 * short blank on load is the price of never showing a protected page, even for
 * a frame, to someone who is not signed in.
 *
 * After that, any API call that comes back 401 or "password change required"
 * (see `lib/http.ts`) moves the reader to the right step without a reload.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<Member | null>(null);
  const [notice, setNotice] = useState<AuthNotice>(null);

  const refresh = useCallback(async () => {
    const check = await checkSession();
    if (check.state === 'member') {
      setUser(check.member);
      setStatus(check.member.restricted ? 'restricted' : 'authenticated');
      setNotice(null);
      return;
    }
    setUser(null);
    setStatus('anonymous');
    if (check.state === 'unknown') setNotice('unreachable');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<SessionEventDetail>).detail;
      if (detail === 'restricted') {
        setStatus('restricted');
        return;
      }
      setUser(null);
      setStatus('anonymous');
      setNotice('expired');
    };
    window.addEventListener(SESSION_EVENT, onSession);
    return () => window.removeEventListener(SESSION_EVENT, onSession);
  }, []);

  const signOut = useCallback(async () => {
    await logOut();
    setUser(null);
    setStatus('anonymous');
    setNotice('loggedOut');
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, notice, refresh, signOut, clearNotice }),
    [status, user, notice, refresh, signOut, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
