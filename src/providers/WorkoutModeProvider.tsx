import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthProvider';
import { useWorkoutRecovery, useWorkoutSession } from '../lib/fitness/session';
import { pendingWorkoutCount, syncPendingWorkouts } from '../lib/fitness/offline';
import { primeWorkoutOfflineData } from '../lib/fitness/data';
import { useNetworkStatus, useWorkoutNative, type WorkoutNativeHandle } from '../lib/workoutNative';

interface WorkoutModeValue {
  online: boolean | null; pending: number; syncing: boolean; error: string | null;
  refresh(): Promise<void>; retry(): Promise<void>; native: WorkoutNativeHandle;
}
const Context = createContext<WorkoutModeValue | null>(null);

export function WorkoutModeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const w = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  const { online } = useNetworkStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const locked = useRef(new Set<string>());
  const item = w.items[Math.min(w.focusIndex ?? 0, Math.max(0, w.items.length - 1))];
  const native = useWorkoutNative(userId && w.active && w.sessionId ? {
    sessionId: `${userId}:${w.sessionId}`, name: w.name, exerciseName: item?.exercise.name ?? 'Choose an exercise',
    completedSets: w.items.reduce((sum, exercise) => sum + exercise.sets.filter((set) => !!set.completed_at).length, 0),
    totalSets: w.items.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    restEndsAt: w.pausedAt ? null : w.restEndsAt ?? null, active: true, paused: !!w.pausedAt,
  } : null, { ready: recovery.ready, deepLinkUrl: 'buko://workout/active' });
  const refresh = useCallback(async () => {
    if (!userId) { setPending(0); return; }
    try {
      const count = await pendingWorkoutCount(userId);
      if (currentUser.current === userId) setPending(count);
    } catch (e) { if (currentUser.current === userId) setError(e instanceof Error ? e.message : 'Could not read offline workouts.'); }
  }, [userId]);
  const retry = useCallback(async () => {
    if (!userId || locked.current.has(userId)) return;
    locked.current.add(userId); setSyncing(true);
    try {
      if (online === false) { await refresh(); return; }
      const result = await syncPendingWorkouts(userId);
      if (currentUser.current !== userId) return;
      setPending(result.pending); setError(result.error ?? null);
    } catch (e) { if (currentUser.current === userId) setError(e instanceof Error ? e.message : 'Workout sync failed. Your local workout is kept.'); }
    finally { locked.current.delete(userId); if (currentUser.current === userId) setSyncing(false); }
  }, [userId, online, refresh]);
  useEffect(() => {
    setError(null); setPending(0);
    setSyncing(userId ? locked.current.has(userId) : false);
    void refresh();
    if (userId && online !== false) {
      void primeWorkoutOfflineData().catch((e: Error) => { if (currentUser.current === userId) setError(e.message); });
      void retry();
    }
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') { void refresh(); void retry(); } });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' || AppState.currentState === null) { void refresh(); void retry(); }
    }, 30000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [userId, online, refresh, retry]);
  const value = useMemo(() => ({ online, pending, syncing, error, refresh, retry, native }), [online, pending, syncing, error, refresh, retry, native]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkoutMode() {
  const value = useContext(Context);
  if (!value) throw new Error('WorkoutModeProvider is missing.');
  return value;
}
