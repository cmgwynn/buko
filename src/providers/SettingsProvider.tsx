import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountStorageWrites } from '../lib/account/storageWrites';
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
  const owner = useRef(userId);
  owner.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) return setSettings(null);
    try {
      const raw = await AsyncStorage.getItem(`buko:workout-settings:${userId}`);
      if (raw) {
        const cached = JSON.parse(raw) as UserSettings;
        if (cached.user_id === userId && owner.current === userId) setSettings(cached);
      }
    } catch (e) { console.warn('Offline workout settings could not be read.', e instanceof Error ? e.message : 'Storage unavailable'); }
    const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
    if (owner.current !== userId) return;
    if (error) { console.warn('Workout settings could not refresh; retaining saved preferences.', error.message); return; }
    setSettings(data ? ({ ...(data as UserSettings), activity_share: Number((data as UserSettings).activity_share) }) : { user_id: userId, ...DEFAULT_SETTINGS });
    try {
      await accountStorageWrites.run(userId, () => AsyncStorage.setItem(`buko:workout-settings:${userId}`, JSON.stringify(data ?? { user_id: userId, ...DEFAULT_SETTINGS })));
    } catch (e) { console.warn('Offline workout settings could not be saved.', e instanceof Error ? e.message : 'Storage unavailable'); }
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
      try {
        await accountStorageWrites.run(userId, () => AsyncStorage.setItem(`buko:workout-settings:${userId}`, JSON.stringify(next)));
      } catch { return 'Settings saved online, but their offline copy could not be updated. Free device storage and refresh.'; }
      return null;
    },
    [userId, settings],
  );

  const value = useMemo(() => ({ settings: settings?.user_id === userId ? settings : null, update, refresh }), [settings, userId, update, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
