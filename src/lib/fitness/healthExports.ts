import { supabase } from '../supabase';
import { activityHintFor, getAdapter } from '../health';
import { checkHealthAccess } from '../billing/client';
import { getFitnessOfflineSnapshot, recordHealthExportReceipt } from './offline';
import { workoutSessionStore } from './session';
import { createWorkoutHealthSync, type HealthExportJob } from './healthExportEngine';

interface QueueRow {
  workout_id: string;
  status: HealthExportJob['status'];
  external_id: string | null;
  workouts: {
    name: string;
    started_at: string;
    duration_min: number | null;
    calories_burned: number | null;
    exported_external_id: string | null;
    workout_exercises: { exercises: { name: string; category: 'strength' | 'cardio' } }[];
  };
}

const jobsByAccount = new Map<string, Map<string, QueueRow>>();

export const syncWorkoutHealthExports = createWorkoutHealthSync({
  currentAccount: () => workoutSessionStore.getAccount(),
  supportsIdempotency: () => Boolean((getAdapter() as { supportsWorkoutIdempotency?: boolean } | null)?.supportsWorkoutIdempotency),
  async jobs(userId) {
    const { data, error } = await supabase.from('workout_health_export_queue')
      .select('workout_id,status,external_id,workouts!inner(name,started_at,duration_min,calories_burned,exported_external_id,workout_exercises(exercises(name,category)))')
      .eq('user_id', userId).neq('status', 'exported').order('requested_at').limit(50).abortSignal(AbortSignal.timeout(12_000));
    if (error) throw new Error(`Health export queue could not load: ${error.message}`);
    const rows = data as unknown as QueueRow[];
    jobsByAccount.set(userId, new Map(rows.map((row) => [row.workout_id, row])));
    return rows.map((row) => ({
      workoutId: row.workout_id, status: row.status,
      externalId: row.external_id ?? row.workouts.exported_external_id,
    }));
  },
  async canExport(userId) {
    const { data, error } = await supabase.from('user_settings').select('health_write_workouts')
      .eq('user_id', userId).abortSignal(AbortSignal.timeout(12_000)).maybeSingle();
    if (error) throw new Error(`Health export consent could not be checked: ${error.message}`);
    if (!data?.health_write_workouts || !await checkHealthAccess()) return false;
    const adapter = getAdapter();
    return Boolean(adapter && await adapter.isAvailable());
  },
  async receipt(userId, workoutId) {
    return (await getFitnessOfflineSnapshot(userId)).healthReceipts?.[workoutId] ?? null;
  },
  saveReceipt: recordHealthExportReceipt,
  async mark(userId, job, status, error, externalId) {
    const updated = await supabase.rpc('mark_workout_health_export', {
      p_workout_id: job.workoutId, p_status: status, p_error: error,
      p_external_id: externalId ?? null, p_expected_user_id: userId,
    }).abortSignal(AbortSignal.timeout(12_000));
    if (updated.error) throw new Error(`Health export status could not sync: ${updated.error.message}`);
  },
  async write(userId, job) {
    const row = jobsByAccount.get(userId)?.get(job.workoutId);
    const adapter = getAdapter();
    if (!row || !adapter) throw new Error('This health export is not available on the current device.');
    const w = row.workouts;
    const start = new Date(w.started_at);
    const request = {
      clientId: job.workoutId,
      name: w.name, start, end: new Date(start.getTime() + Math.max(1, Number(w.duration_min ?? 0)) * 60_000),
      calories: w.calories_burned == null ? null : Number(w.calories_burned),
      distanceM: null,
      hint: activityHintFor(w.workout_exercises.map((item) => item.exercises)),
    };
    const externalId = await adapter.writeWorkout(request);
    if (!externalId) throw new Error('The health app did not grant workout writing or confirm a saved copy.');
    return externalId;
  },
});
