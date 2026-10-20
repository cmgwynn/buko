import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { NutritionTargets, Profile } from '../types';
import { useAuth } from './AuthProvider';

interface ProfileContextValue {
  profile: Profile | null;
  targets: NutritionTargets | null;
  /** True until the first profile fetch for the current user completes. */
  loading: boolean;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  targets: null,
  loading: true,
  refresh: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setTargets(null);
      setLoadedFor(null);
      return;
    }
    const [p, t] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('nutrition_targets').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    setProfile((p.data as Profile) ?? null);
    setTargets((t.data as NutritionTargets) ?? null);
    setLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Loading until the profile for the *current* user has been fetched (avoids flashing onboarding on sign-in).
  const loading = userId !== null && loadedFor !== userId;

  const value = useMemo(() => ({ profile, targets, loading, refresh }), [profile, targets, loading, refresh]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);
