import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type UserSettings } from '../lib/fitness/types';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

interface SettingsContextValue {
  settings: UserSettings | null;
  update: (patch: Partial<Omit<UserSettings, 'user_id'>>) => Promise<string | null>;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({ settings: null, update: async () => null, refresh: async () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return setSettings(null);
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    setSettings(data ? ({ ...(data as UserSettings), activity_share: Number((data as UserSettings).activity_share) }) : { user_id: userId, ...DEFAULT_SETTINGS });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (patch: Partial<Omit<UserSettings, 'user_id'>>) => {
      if (!userId) return 'Not signed in.';
      const next = { ...(settings ?? { user_id: userId, ...DEFAULT_SETTINGS }), ...patch };
      const { error } = await supabase.from('user_settings').upsert({ ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) return error.message;
      setSettings(next);
      return null;
    },
    [userId, settings],
  );

  const value = useMemo(() => ({ settings, update, refresh }), [settings, update, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
