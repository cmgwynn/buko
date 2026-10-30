import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountStorageWrites } from '../lib/account/storageWrites';
import { supabase } from '../lib/supabase';
import { birthdayTargets, profileAge } from '../lib/nutrition/birthday';
import { applyAdaptiveCalorieAdjustment } from '../lib/nutrition/targets';
import { useLocalDay } from '../lib/useLocalDay';
import type { NutritionTargets, Profile } from '../types';
import { useAuth } from './AuthProvider';

interface ProfileContextValue {
  profile: Profile | null;
  targets: NutritionTargets | null;
  age: number | null;
  today: string;
  birthdayError: string | null;
  connectionError: string | null;
  /** True until the first profile fetch for the current user completes. */
  loading: boolean;
  refresh: () => Promise<boolean>;
}

const ProfileContext = createContext<ProfileContextValue>({
  profile: null,
  targets: null,
  age: null,
  today: '',
  birthdayError: null,
  connectionError: null,
  loading: true,
  refresh: async () => true,
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const request = useRef(0);
  const activeUser = useRef(userId);
  activeUser.current = userId;
  const today = useLocalDay();

  const refresh = useCallback(async () => {
    const version = ++request.current;
    if (!userId) {
      setProfile(null);
      setTargets(null);
      setLoadedFor(null);
      setConnectionError(null);
      return true;
    }
    const key = `buko:workout-profile:${userId}`;
    let cached: { profile: Profile; targets: NutritionTargets | null } | null = null;
    let cacheError: string | null = null;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as { profile?: Profile; targets?: NutritionTargets | null };
        if (!saved.profile || saved.profile.user_id !== userId) throw new Error('Saved profile is invalid.');
        cached = { profile: saved.profile, targets: saved.targets ?? null };
        if (version === request.current && activeUser.current === userId) {
          setProfile(cached.profile); setTargets(cached.targets); setLoadedFor(userId);
        }
      }
    } catch { cacheError = 'Your offline workout profile could not be read. Reconnect before closing the app.'; }
    const [p, t] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
      supabase.from('nutrition_targets').select('*').eq('user_id', userId).abortSignal(AbortSignal.timeout(10000)).maybeSingle(),
    ]);
    if (version !== request.current || activeUser.current !== userId) return false;
    if (p.error || t.error) {
      setConnectionError(`${cached ? 'Using your saved profile for offline workouts.' : 'Your profile could not be loaded. Reconnect and retry.'} ${cacheError ?? p.error?.message ?? t.error?.message}`);
      setLoadedFor(userId);
      return false;
    }
    setProfile((p.data as Profile) ?? null);
    setTargets((t.data as NutritionTargets) ?? null);
    setLoadedFor(userId);
    try {
      await accountStorageWrites.run(userId, () => p.data
        ? AsyncStorage.setItem(key, JSON.stringify({ profile: p.data, targets: t.data }))
        : AsyncStorage.removeItem(key));
      if (version === request.current && activeUser.current === userId) setConnectionError(null);
    } catch {
      if (version === request.current) setConnectionError('Profile loaded, but its offline workout copy could not be saved. Free device storage and retry.');
    }
    return true;
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Loading until the profile for the *current* user has been fetched (avoids flashing onboarding on sign-in).
  const loading = userId !== null && loadedFor !== userId;

  const value = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    const currentProfile = profile?.user_id === userId ? profile : null;
    const age = currentProfile ? profileAge(currentProfile, date) : null;
    let currentTargets = currentProfile ? targets : null;
    let birthdayError: string | null = null;
    if (currentProfile?.birth_date) {
      try {
        currentTargets = birthdayTargets(currentProfile, date);
      } catch (err) {
        currentTargets = null;
        birthdayError = err instanceof Error ? err.message : 'Could not calculate targets from your birthday. Please update your details.';
      }
    }
    if (currentProfile && currentTargets) {
      currentTargets = applyAdaptiveCalorieAdjustment(
        currentTargets,
        targets?.adaptive_calorie_adjustment ?? 0,
        currentProfile.sex,
      );
    }
    return { profile: loadedFor === userId ? currentProfile : null, targets: currentTargets, age, today, birthdayError, connectionError, loading, refresh };
  }, [profile, targets, today, connectionError, loadedFor, userId, loading, refresh]);
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export const useProfile = () => useContext(ProfileContext);
