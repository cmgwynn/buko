import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { recoverAccountWork } from '../lib/recovery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../lib/config';
import { parseOfflineSession } from '../lib/fitness/offlineAuth';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  sessionError?: string | null;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

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
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!live || change !== initialChange) return;
      let next = data.session;
      if (!next && error?.name === 'AuthRetryableFetchError') {
        try {
          const storageKey = `sb-${new URL(config.supabaseUrl).hostname.split('.')[0]}-auth-token`;
          next = parseOfflineSession(await AsyncStorage.getItem(storageKey));
          if (live && change === initialChange) setSessionError(next
            ? 'Offline workout access uses your saved sign-in. Reconnect to refresh sign-in before syncing.'
            : 'No saved sign-in is available. Reconnect and sign in to access your local workout data.');
        } catch { if (live && change === initialChange) setSessionError('Saved sign-in could not be read. Reconnect and sign in again; local workout data has not been deleted.'); }
      } else if (error) setSessionError(`Sign-in could not refresh: ${error.message}`);
      if (live && change === initialChange) await apply(next);
    }).catch((e: Error) => { if (live) { setSessionError(e.message); setLoading(false); } });
    // Do not await Supabase queries inside its auth callback (the auth lock is held there).
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'INITIAL_SESSION' && !next) return;
      if (live) {
        if (next || event === 'SIGNED_OUT') setSessionError(null);
        void apply(next).catch((e: Error) => {
          if (live) { setSessionError(`Account recovery failed: ${e.message}`); setLoading(false); }
        });
      }
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

  const value = useMemo(() => ({ session, loading, sessionError }), [session, loading, sessionError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
