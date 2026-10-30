import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import type { PlannedWorkoutRow } from '../fitness/data';
import { cachePlannedWorkouts, getFitnessOfflineSnapshot } from '../fitness/offline';
import { adjustSnapshot, type TrainingMode } from './checkin';

export const checkinKey = (userId: string, weekStart: string) => `buko:checkin:${userId}:${weekStart}`;

export async function checkinDone(userId: string, weekStart: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(checkinKey(userId, weekStart))) != null; } catch { return false; }
}
export async function markCheckinDone(userId: string, weekStart: string, mode: TrainingMode | 'skipped'): Promise<void> {
  await AsyncStorage.setItem(checkinKey(userId, weekStart), mode);
}

const NOTE = {
  ease: 'Eased after your weekly check-in',
  progress: 'Stepped up after your weekly check-in',
  hold: '',
} as const;

/** Durable per-week marker in the plan's notes so a retried check-in never adjusts a workout twice. */
export const checkinMarker = (weekStart: string) => `(check-in ${weekStart})`;

/**
 * Rewrites only uncompleted plans, guarded by the reviewed `updated_at` so edits or completions made
 * meanwhile are never overwritten. Returns how many were updated.
 */
export async function applyCheckin(userId: string, weekStart: string, plans: readonly PlannedWorkoutRow[], mode: TrainingMode): Promise<number> {
  if (mode === 'hold') return 0;
  let updated = 0;
  const saved: PlannedWorkoutRow[] = [];
  for (const plan of plans) {
    if (plan.completed_workout_id || plan.user_id !== userId || !plan.updated_at) continue;
    if (plan.notes?.includes(checkinMarker(weekStart))) continue;
    const fields = {
      snapshot: adjustSnapshot(plan.snapshot, mode),
      notes: [plan.notes?.trim(), `${NOTE[mode]} ${checkinMarker(weekStart)}.`].filter(Boolean).join('\n'),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('planned_workouts').update(fields)
      .eq('id', plan.id).eq('user_id', userId).eq('updated_at', plan.updated_at)
      .is('completed_workout_id', null).select('id');
    if (error) throw new Error(error.message);
    if (data?.length) { updated++; saved.push({ ...plan, ...fields }); }
  }
  if (saved.length) {
    const cached = await getFitnessOfflineSnapshot(userId);
    const ids = new Set(saved.map((row) => row.id));
    await cachePlannedWorkouts(userId, [...cached.plannedWorkouts.filter((row) => !ids.has(row.id)), ...saved]);
  }
  return updated;
}
