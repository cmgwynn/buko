import { supabase } from '../supabase';
import { savePlannedWorkout } from './data';
import { cachePlannedWorkouts, getFitnessOfflineSnapshot } from './offline';
import type { TrainingSaveOperation } from './progression';

/**
 * New slots use the existing plan helper. Explicit replacements additionally compare the
 * reviewed version and completion state in the write itself, avoiding a read/write race.
 */
export async function saveTrainingSlot(userId: string, operation: TrainingSaveOperation): Promise<void> {
  const { day, replace } = operation;
  const fields = {
    planned_for: day.date, name: day.name.trim(), notes: `${day.notes}\n\nWhy: ${day.rationale}`.trim(),
    routine_id: null, snapshot: day.snapshot,
  };
  if (!replace) {
    await savePlannedWorkout(userId, fields);
    return;
  }
  if (!replace.updated_at || replace.completed_workout_id || replace.user_id !== userId) {
    throw new Error('This replacement cannot be verified. Refresh the preview.');
  }
  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase.from('planned_workouts').update({
    ...fields, updated_at: updatedAt,
  }).eq('id', replace.id).eq('user_id', userId).eq('updated_at', replace.updated_at)
    .is('completed_workout_id', null).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('This plan changed or was completed. It was not replaced. Refresh the preview.');
  const cached = await getFitnessOfflineSnapshot(userId);
  const row = { ...replace, ...fields, updated_at: updatedAt };
  await cachePlannedWorkouts(userId, [...cached.plannedWorkouts.filter((plan) => plan.id !== row.id), row]);
}
