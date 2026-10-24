import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { workoutSessionStore } from './session';
import { createFitnessOfflineStore } from './offlineStore';

export * from './offlineStore';

export const {
  getFitnessOfflineSnapshot, cacheWorkoutCatalog, cacheWorkoutRoutines, cachePlannedWorkouts,
  cacheWorkoutHistory, cachedWorkoutHistory, cacheExerciseRestSeconds, cachedExerciseRestSeconds,
  queueCompletedWorkout, pendingWorkoutCount, listQueuedWorkouts, getFinishedWorkout,
  discardPendingWorkouts, purgeFitnessOfflineData, syncPendingWorkouts: syncCompletedWorkouts,
  recordHealthExportReceipt,
  removeCachedWorkout,
  activateFitnessOfflineAccount,
} = createFitnessOfflineStore({
  storage: AsyncStorage,
  rpc: (name, args) => supabase.rpc(name, args).abortSignal(AbortSignal.timeout(12_000)),
  account: () => workoutSessionStore.getAccount(),
});

export async function syncPendingWorkouts(userId: string): Promise<{ pending: number; error?: string }> {
  const completed = await syncCompletedWorkouts(userId);
  if (completed.error) return completed;
  const { syncWorkoutHealthExports } = await import('./healthExports');
  const health = await syncWorkoutHealthExports(userId);
  return { pending: completed.pending, ...(health.error ? { error: health.error } : {}) };
}
