import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import api, { SESSION_EXPIRED_EVENT } from '../api/client';

type User = { name: string };
type Status = 'loading' | 'signedIn' | 'signedOut';
type Envelope<T> = { data: T };

type AuthValue = {
  status: Status;
  user: User | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * One sign-in for the whole dashboard. The backend keeps the session in an httpOnly
 * cookie (7 days), so every tab and every page share it; nothing is stored in the page.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<Envelope<{ user: User }>>('/session/me').then(
      ({ data }) => {
        if (cancelled) return;
        setUser(data.data.user);
        setStatus('signedIn');
      },
      () => !cancelled && setStatus('signedOut'),
    );
    // Any request answered "sign in required" (session expired or signed out in another tab).
    const onExpired = () => {
      setUser(null);
      setStatus('signedOut');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const { data } = await api.post<Envelope<{ user: User }>>('/session/login', { username, password });
    setUser(data.data.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/session/logout');
    } finally {
      setUser(null);
      setStatus('signedOut');
    }
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
