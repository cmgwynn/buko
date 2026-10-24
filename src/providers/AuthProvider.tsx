import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { recoverAccountWork } from '../lib/recovery';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    let change = 0;
    let activeUser: string | null | undefined;
    async function apply(next: Session | null) {
      const userId = next?.user.id ?? null;
      if (activeUser === userId) {
        if (live) setSession(next);
        return;
      }
      activeUser = userId;
      const version = ++change;
      setLoading(true);
      setSession(next);
      await recoverAccountWork(userId);
      if (live && version === change) setLoading(false);
    }
    const initialChange = change;
    supabase.auth.getSession().then(({ data }) => {
      if (live && change === initialChange) void apply(data.session);
    });
    // Do not await Supabase queries inside its auth callback (the auth lock is held there).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (live) void apply(next);
    });

    // Only refresh tokens while the app is in the foreground.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
      appState.remove();
    };
  }, []);

  const value = useMemo(() => ({ session, loading }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
