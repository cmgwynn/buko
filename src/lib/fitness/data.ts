import { toDateString } from '../diary';
import { supabase } from '../supabase';
import type { DatedSet } from './calc';
import type { Exercise, MeasurementKind, WorkoutSet } from './types';
import type { WorkoutSession } from './session';
import type { RoutineExercise } from './routines';

export const localDate = (iso: string) => toDateString(new Date(iso));

export async function loadExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name');
  if (error) throw new Error(error.message);
  return data as Exercise[];
}

export async function createExercise(
  userId: string,
  e: { name: string; category: 'strength' | 'cardio'; muscle_groups: string[]; equipment: string | null },
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({ user_id: userId, met: e.category === 'cardio' ? 7 : 5, ...e })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Exercise;
}

interface HistoryRow {
  workout_id: string;
  workouts: { started_at: string; name: string };
  workout_sets: (WorkoutSet & { id: string })[];
}

/** Every logged session of one exercise, newest first. */
export async function exerciseHistory(exerciseId: string, excludeWorkoutId?: string) {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('workout_id, workouts!inner(started_at, name), workout_sets(id, position, reps, weight_kg, is_warmup, duration_s, distance_m)')
    .eq('exercise_id', exerciseId);
  if (error) throw new Error(error.message);
  const rows = (data as unknown as HistoryRow[]).filter((r) => r.workout_id !== excludeWorkoutId);
  rows.sort((a, b) => (a.workouts.started_at < b.workouts.started_at ? 1 : -1));
  const sessions = rows.map((r) => ({
    workoutId: r.workout_id,
    date: localDate(r.workouts.started_at),
    workoutName: r.workouts.name,
    sets: [...r.workout_sets].sort((a, b) => a.position - b.position),
  }));
  const dated: DatedSet[] = sessions.flatMap((s) => s.sets.map((x) => ({ date: s.date, reps: x.reps, weight_kg: x.weight_kg, is_warmup: x.is_warmup })));
  return { sessions, dated };
}

/** Save the in-progress workout, its exercises and sets. Returns the new workout id. */
export async function saveWorkout(
  userId: string,
  s: WorkoutSession,
  extra: { durationMin: number; calories: number | null; caloriesEstimated: boolean; notes?: string },
): Promise<string> {
  const { data: w, error } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      name: s.name.trim() || 'Workout',
      started_at: new Date(s.startedAt).toISOString(),
      duration_min: extra.durationMin,
      calories_burned: extra.calories,
      calories_estimated: extra.caloriesEstimated,
      notes: extra.notes || null,
      routine_id: s.routineId,
      source: 'buko',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const workoutId = (w as { id: string }).id;

  try {
    const items = s.items.filter((i) => i.sets.length > 0);
    if (items.length) {
      const { data: wes, error: e2 } = await supabase
        .from('workout_exercises')
        .insert(items.map((i, idx) => ({ workout_id: workoutId, user_id: userId, exercise_id: i.exercise.id, position: idx })))
        .select('id, position');
      if (e2) throw new Error(e2.message);
      const idByPos = new Map((wes as { id: string; position: number }[]).map((r) => [r.position, r.id]));
      const sets = items.flatMap((i, idx) =>
        i.sets.map((x, n) => ({
          workout_exercise_id: idByPos.get(idx),
          user_id: userId,
          position: n,
          reps: x.reps,
          weight_kg: x.weight_kg,
          is_warmup: x.is_warmup,
          duration_s: x.duration_s,
          distance_m: x.distance_m,
        })),
      );
      const { error: e3 } = await supabase.from('workout_sets').insert(sets);
      if (e3) throw new Error(e3.message);
    }
  } catch (err) {
    // Do not leave a half-saved workout behind.
    await supabase.from('workouts').delete().eq('id', workoutId);
    throw err;
  }
  return workoutId;
}

export async function saveRoutine(userId: string, name: string, s: WorkoutSession): Promise<void> {
  const items: RoutineExercise[] = s.items.map((i) => {
    const working = i.sets.filter((x) => !x.is_warmup);
    const top = working[0] ?? i.sets[0];
    const cardio = i.exercise.category === 'cardio';
    return {
      exercise: i.exercise,
      sets: cardio ? 1 : Math.max(1, working.length),
      reps: cardio ? null : top?.reps || null,
      weightKg: cardio ? null : top?.weight_kg ?? null,
      durationS: top?.duration_s || null,
      distanceM: cardio ? top?.distance_m || null : null,
    };
  });
  await saveRoutineTemplate(userId, name.trim() || 'Routine', items);
}

export interface RoutineRow {
  id: string;
  name: string;
  routine_exercises: {
    id?: string;
    position: number;
    exercise_id: string;
    target_sets: number | null;
    target_reps: number | null;
    target_weight_kg: number | null;
    target_duration_s: number | null;
    target_distance_m: number | null;
    exercises: Exercise;
  }[];
}

export async function loadRoutines(): Promise<RoutineRow[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('id, name, routine_exercises(id, position, exercise_id, target_sets, target_reps, target_weight_kg, target_duration_s, target_distance_m, exercises(*))')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as RoutineRow[]).map((r) => ({ ...r, routine_exercises: [...r.routine_exercises].sort((a, b) => a.position - b.position) }));
}

export function editableRoutineItems(routine: RoutineRow): RoutineExercise[] {
  return routine.routine_exercises.map((item) => ({
    id: item.id, exercise: item.exercises, sets: item.target_sets ?? 1, reps: item.target_reps,
    weightKg: item.target_weight_kg, durationS: item.target_duration_s, distanceM: item.target_distance_m,
  }));
}

/** Updates only the routine template, never workout history. Keep existing child ids when editing. */
export async function saveRoutineTemplate(userId: string, name: string, items: RoutineExercise[], original?: RoutineRow): Promise<string> {
  if (!name.trim() || name.trim().length > 100 || !items.length) throw new Error('Enter a name and at least one exercise.');
  let id = original?.id;
  if (!id) {
    const { data, error } = await supabase.from('routines').insert({ user_id: userId, name: name.trim() }).select('id').single();
    if (error) throw new Error(error.message);
    id = (data as { id: string }).id;
  }
  try {
    const { data: saved, error } = await supabase.from('routine_exercises').upsert(items.map((item, position) => ({
      ...(item.id ? { id: item.id } : {}),
      routine_id: id, user_id: userId, exercise_id: item.exercise.id, position,
      target_sets: item.sets, target_reps: item.reps, target_weight_kg: item.weightKg,
      target_duration_s: item.durationS, target_distance_m: item.distanceM,
    })), { onConflict: 'id', defaultToNull: false }).select('id');
    if (error) throw new Error(error.message);
    if (!saved || saved.length !== items.length) throw new Error('Not all routine exercises were saved. Please reload.');
    const savedIds = new Set(saved.map((row: { id: string }) => row.id));
    const removedIds = original?.routine_exercises.flatMap((item) => item.id && !savedIds.has(item.id) ? [item.id] : []) ?? [];
    if (removedIds.length) {
      const { error: removeError } = await supabase.from('routine_exercises').delete().eq('routine_id', id).in('id', removedIds);
      if (removeError) throw new Error(removeError.message);
    }
    const { data: updated, error: updateError } = await supabase.from('routines')
      .update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId).select('id').single();
    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('The routine could not be updated.');
    return id;
  } catch (error) {
    if (!original) {
      const { error: cleanupError } = await supabase.from('routines').delete().eq('id', id);
      if (cleanupError) throw new Error('The routine was only partly saved and cleanup failed. Reload Train and review it before trying again.');
    }
    const message = error instanceof Error ? error.message : 'Could not save routine.';
    throw new Error(original ? `${message} Some changes may have been saved. Reload the routine before trying again.` : message);
  }
}

export async function deleteWorkout(id: string): Promise<void> {
  const { data, error } = await supabase.from('workouts').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('The workout was not deleted. It may already be gone, or your session may have expired. Reload Train and try again.');
}

/** Turn a routine into starting items for a new workout. */
export function routineToItems(r: RoutineRow) {
  return r.routine_exercises.map((re) => {
    const n = re.target_sets ?? 1;
    const sets: WorkoutSet[] = Array.from({ length: n }, (_, i) => ({
      position: i,
      reps: re.target_reps,
      weight_kg: re.target_weight_kg,
      is_warmup: false,
      duration_s: re.target_duration_s,
      distance_m: re.target_distance_m,
    }));
    return { exercise: re.exercises, sets };
  });
}

export interface WorkoutListRow {
  id: string;
  name: string;
  started_at: string;
  duration_min: number | null;
  calories_burned: number | null;
  calories_estimated: boolean;
  source: string;
  workout_exercises: { exercises: { name: string } }[];
}

export async function loadRecentWorkouts(limit = 20): Promise<WorkoutListRow[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name, started_at, duration_min, calories_burned, calories_estimated, source, workout_exercises(exercises(name))')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as unknown as WorkoutListRow[];
}

export interface TrainingRow {
  exercise_id: string;
  exercises: Pick<Exercise, 'name' | 'muscle_groups' | 'category'>;
  workouts: { started_at: string };
  workout_sets: Pick<WorkoutSet, 'reps' | 'weight_kg' | 'is_warmup'>[];
}

/** All exercises logged since a date, with their sets, for weekly volume and muscle balance. */
export async function loadTraining(sinceIso: string): Promise<TrainingRow[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('exercise_id, exercises(name, muscle_groups, category), workouts!inner(started_at), workout_sets(reps, weight_kg, is_warmup)')
    .gte('workouts.started_at', sinceIso);
  if (error) throw new Error(error.message);
  return data as unknown as TrainingRow[];
}

/** Best-ever sets per exercise, for the records list. */
export async function loadAllTraining(): Promise<TrainingRow[]> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('exercise_id, exercises(name, muscle_groups, category), workouts!inner(started_at), workout_sets(reps, weight_kg, is_warmup)');
  if (error) throw new Error(error.message);
  return data as unknown as TrainingRow[];
}

export interface MeasurementRow {
  id: string;
  measured_on: string;
  kind: MeasurementKind;
  value: number;
}

export async function loadMeasurements(kind?: MeasurementKind): Promise<MeasurementRow[]> {
  let q = supabase.from('body_measurements').select('id, measured_on, kind, value').order('measured_on');
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as MeasurementRow[]).map((r) => ({ ...r, value: Number(r.value) }));
}

export async function upsertMeasurement(userId: string, date: string, kind: MeasurementKind, value: number) {
  const { error } = await supabase
    .from('body_measurements')
    .upsert({ user_id: userId, measured_on: date, kind, value }, { onConflict: 'user_id,measured_on,kind' });
  if (error) throw new Error(error.message);
}

/** Calories burned on a day from Buko-logged workouts (used when no health-app total exists). */
export async function loadBurnedForDay(day: string): Promise<number> {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start.getTime() + 86400000);
  const { data } = await supabase
    .from('workouts')
    .select('calories_burned')
    .gte('started_at', start.toISOString())
    .lt('started_at', end.toISOString());
  return ((data as { calories_burned: number | null }[] | null) ?? []).reduce((s, r) => s + (r.calories_burned ?? 0), 0);
}
