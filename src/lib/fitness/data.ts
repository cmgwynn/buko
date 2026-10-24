import { toDateString } from '../diary';
import { supabase } from '../supabase';
import { newRecordsFor, type DatedSet, type RecordKind } from './calc';
import { validateSet, workoutDurationMs } from './engine';
import { summarizeSession } from './summary';
import { stableUUID } from './ids';
import {
  cachePlannedWorkouts, cacheWorkoutCatalog, cacheWorkoutHistory, cacheWorkoutRoutines, cachedWorkoutHistory, cacheExerciseRestSeconds,
  FitnessOfflineError, getFitnessOfflineSnapshot, getFinishedWorkout, queueCompletedWorkout, removeCachedWorkout, syncPendingWorkouts,
  type WorkoutSummary,
} from './offline';
import type { Exercise, MeasurementKind, WorkoutSet } from './types';
import { endSession, getSession, startSession, updateSession, workoutSessionStore, type SessionItem, type WorkoutSession } from './session';
import type { RoutineExercise } from './routines';

export const localDate = (iso: string) => toDateString(new Date(iso));
const requestTimeout = () => AbortSignal.timeout(12_000);

async function currentUserId(): Promise<string> {
  const owner = workoutSessionStore.getAccount();
  if (owner) return owner;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session?.user.id) throw new Error('Sign in to access workout data.');
  return data.session.user.id;
}

export async function loadExercises(): Promise<Exercise[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('exercises').select('*').order('name').abortSignal(requestTimeout());
  if (error) {
    const cached = await getFitnessOfflineSnapshot(userId);
    if (cached.catalogCached || cached.catalog.length) return cached.catalog;
    throw new Error(`Workout exercise library is unavailable offline: ${error.message}`);
  }
  await cacheWorkoutCatalog(userId, (data ?? []) as Exercise[]);
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
  workout_sets: (WorkoutSet & { id: string; completed_at?: string | null })[];
}

/** Every logged session of one exercise, newest first. */
export async function exerciseHistory(exerciseId: string, excludeWorkoutId?: string) {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('workout_id, workouts!inner(started_at, name), workout_sets(id, position, reps, weight_kg, is_warmup, duration_s, distance_m, completed_at, rpe)')
    .eq('exercise_id', exerciseId).abortSignal(requestTimeout());
  if (error) {
    const cached = await cachedWorkoutHistory<ReturnType<typeof mapExerciseHistory>>(userId, `exercise:${exerciseId}`);
    if (cached) return cached;
    throw new Error(`Workout history is unavailable offline: ${error.message}`);
  }
  const result = mapExerciseHistory((data as unknown as HistoryRow[]).filter((r) => r.workout_id !== excludeWorkoutId));
  await cacheWorkoutHistory(userId, `exercise:${exerciseId}`, result);
  return result;
}

function mapExerciseHistory(rows: HistoryRow[]) {
  rows.sort((a, b) => (a.workouts.started_at < b.workouts.started_at ? 1 : -1));
  const sessions = rows.map((r) => ({
    workoutId: r.workout_id,
    date: localDate(r.workouts.started_at),
    workoutName: r.workouts.name,
    sets: [...r.workout_sets].map((set) => ({ ...set, completed: true })).sort((a, b) => a.position - b.position),
  }));
  const dated: DatedSet[] = sessions.flatMap((s) => s.sets.map((x) => ({ date: s.date, reps: x.reps, weight_kg: x.weight_kg, is_warmup: x.is_warmup })));
  return { sessions, dated };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asUUID = (candidate?: string) => candidate && uuidPattern.test(candidate) ? candidate : stableUUID();
const legacySessionIds = new WeakMap<WorkoutSession, string>();
function workoutSessionId(session: WorkoutSession): string {
  const supplied = session.sessionId ?? session.id;
  if (supplied && uuidPattern.test(supplied)) return supplied;
  const existing = legacySessionIds.get(session);
  if (existing) return existing;
  const id = stableUUID();
  legacySessionIds.set(session, id);
  return id;
}

function completedWorkoutPayload(
  session: WorkoutSession,
  extra: { durationMin: number; calories: number | null; caloriesEstimated: boolean; notes?: string; rating?: 'easy' | 'right' | 'hard' | null; healthExport?: boolean },
  legacyAllSetsAreCompleted = false,
) {
  const completedAt = session.completedAt ?? new Date(session.pausedAt ?? Date.now()).toISOString();
  const startedAt = new Date(session.startedAt);
  if (!Number.isFinite(startedAt.getTime())) throw new Error('The workout start time is invalid.');
  if ((session.name.trim() || 'Workout').length > 100) throw new Error('Workout names must be 100 characters or fewer.');
  if (session.items.length > 200 || session.items.some((item) => item.sets.length > 1000)) throw new Error('This workout exceeds the supported exercise or set limit.');
  if ((extra.notes?.trim() || session.notes?.trim() || '').length > 10000) throw new Error('Workout notes must be 10,000 characters or fewer.');
  if (!Number.isFinite(extra.durationMin) || extra.durationMin < 0 || extra.durationMin > 5_256_000) throw new Error('The workout duration is invalid.');
  if (extra.calories != null && (!Number.isFinite(extra.calories) || extra.calories < 0 || extra.calories > 20000)) throw new Error('Workout calories must be from 0 to 20,000.');
  for (const item of session.items) {
    if (item.restSeconds !== undefined && (!Number.isInteger(item.restSeconds) || item.restSeconds < 0 || item.restSeconds > 3600)) throw new Error('Exercise rest times must be whole seconds from 0 to 3,600.');
    if ((item.notes?.length ?? 0) > 1000) throw new Error('Exercise notes must be 1,000 characters or fewer.');
    if ((item.supersetId?.length ?? 0) > 100) throw new Error('A superset identifier is too long.');
  }
  const items = session.items.map((item, position) => ({
    id: asUUID(item.id ?? item.key),
    exercise_id: item.exercise.id,
    exercise: item.exercise,
    position,
    notes: item.notes?.trim() || null,
    rest_seconds: item.restSeconds ?? null,
    superset_id: item.supersetId ?? null,
    sets: item.sets.flatMap((set, setPosition) => {
      const isCompleted = legacyAllSetsAreCompleted || set.completed === true || set.completed_at != null;
      if (!isCompleted) return [];
      if (!legacyAllSetsAreCompleted) validateSet(set, item.exercise.category);
      if (set.rpe != null && (!Number.isInteger(set.rpe) || set.rpe < 1 || set.rpe > 10)) {
        throw new Error('Set effort (RPE) must be an integer from 1 to 10.');
      }
      return [{
        id: asUUID(set.id),
        position: Number.isInteger(set.position) && set.position >= 0 ? set.position : setPosition,
        reps: set.reps,
        weight_kg: set.weight_kg,
        is_warmup: set.is_warmup,
        duration_s: set.duration_s,
        distance_m: set.distance_m,
        completed: true,
        completed_at: set.completed_at ?? completedAt,
        rpe: set.rpe ?? null,
      }];
    }),
  })).filter((item) => item.sets.length > 0);
  return {
    id: workoutSessionId(session),
    name: session.name.trim() || 'Workout',
    started_at: startedAt.toISOString(),
    completed_at: completedAt,
    duration_min: Math.max(0, extra.durationMin),
    calories_burned: extra.calories,
    calories_estimated: extra.caloriesEstimated,
    notes: extra.notes?.trim() || session.notes?.trim() || null,
    rating: extra.rating ?? null,
    health_export_requested: extra.healthExport ?? false,
    routine_id: session.routineId,
    planned_workout_id: session.plannedWorkoutId ?? null,
    items,
  };
}

async function saveCompletedWorkoutRpc(userId: string, payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc('save_completed_workout', {
    p_payload: payload,
    p_expected_user_id: userId,
  }).abortSignal(requestTimeout());
  if (error) throw new Error(error.message);
  const id = typeof data === 'string' ? data : (payload.id as string);
  if (!id) throw new Error('The completed workout was not confirmed by the server.');
  return id;
}

export interface WorkoutPersonalRecord {
  exerciseId: string;
  exerciseName: string;
  setId: string;
  records: RecordKind[];
}

export interface FinishWorkoutResult {
  id: string;
  pendingSync: boolean;
  syncError: string | null;
  personalRecords: WorkoutPersonalRecord[];
  summary: WorkoutSummary;
  syncStatus: 'pending' | 'synced';
  healthExportRequested: boolean;
}

async function summarizePersonalRecords(userId: string, session: WorkoutSession): Promise<WorkoutPersonalRecord[]> {
  const records: WorkoutPersonalRecord[] = [];
  for (const item of session.items) {
    const history = await cachedWorkoutHistory<{ dated?: DatedSet[] }>(userId, `exercise:${item.exercise.id}`);
    const previous = history?.dated ?? [];
    for (const set of item.sets) {
      if (set.completed !== true && !set.completed_at) continue;
      const breaking = newRecordsFor(previous, set);
      if (breaking.length) records.push({
        exerciseId: item.exercise.id,
        exerciseName: item.exercise.name,
        setId: set.id ?? '',
        records: breaking,
      });
    }
  }
  return records;
}

/** Durable local completion followed by immediate best-effort replay. */
export async function finishWorkout(
  userId: string,
  session: WorkoutSession,
  extra: { durationMin: number; calories: number | null; caloriesEstimated: boolean; notes?: string },
): Promise<FinishWorkoutResult> {
  if (!userId) throw new FitnessOfflineError('Sign in to finish and save this workout.');
  const payload = completedWorkoutPayload(session, extra);
  const personalRecords = await summarizePersonalRecords(userId, session);
  const summary = await cachedSessionSummary(userId, session);
  await queueCompletedWorkout(userId, payload.id as string, payload, summary);
  const sync = await syncPendingWorkouts(userId);
  const syncError = sync.error ?? null;
  return {
    id: payload.id as string, pendingSync: sync.pending > 0, syncError, personalRecords, summary,
    syncStatus: sync.pending > 0 ? 'pending' : 'synced',
    healthExportRequested: payload.health_export_requested as boolean,
  };
}

async function cachedSessionSummary(userId: string, session: WorkoutSession): Promise<WorkoutSummary> {
  const entries = await Promise.all(session.items.map(async (item) => {
    const cached = await cachedWorkoutHistory<{ sessions?: { workoutId: string; date: string; sets: WorkoutSet[] }[]; dated: DatedSet[] }>(userId, `exercise:${item.exercise.id}`);
    const dated = cached?.sessions
      ? cached.sessions.filter((entry) => entry.workoutId !== session.sessionId).flatMap((entry) => entry.sets.map((set) => ({ ...set, date: entry.date })))
      : cached?.dated ?? [];
    return [item.exercise.id, dated] as const;
  }));
  return summarizeSession(session, Object.fromEntries(entries));
}

export async function summarizeActiveWorkout(): Promise<WorkoutSummary> {
  return cachedSessionSummary(await currentUserId(), getSession());
}

/** Finish the currently active local session; the completed snapshot is durable before any network call. */
export async function finishWorkoutOffline(options: {
  notes: string;
  rating: 'easy' | 'right' | 'hard' | null;
  healthExport: boolean;
}): Promise<{
  id: string;
  sessionSnapshot: Record<string, unknown>;
  summary: WorkoutSummary;
  syncStatus: 'pending' | 'synced';
  syncError: string | null;
  healthExportRequested: boolean;
}> {
  const session = getSession();
  if (!session.active) throw new Error('There is no active workout to finish.');
  const userId = await currentUserId();
  const durationMs = workoutDurationMs(session);
  const summary = await cachedSessionSummary(userId, session);
  if (!summary.completedSets) throw new Error('Complete at least one set before finishing your workout.');
  const payload = completedWorkoutPayload(session, {
    durationMin: durationMs / 60_000,
    calories: null,
    caloriesEstimated: true,
    notes: options.notes,
    rating: options.rating,
    healthExport: options.healthExport,
  });
  await queueCompletedWorkout(userId, payload.id as string, payload, summary);
  await endSession();
  const sync = await syncPendingWorkouts(userId);
  const queued = await getFinishedWorkout(userId, payload.id as string);
  return {
    id: payload.id as string,
    sessionSnapshot: queued?.payload ?? payload,
    summary: queued?.summary ?? summary,
    syncStatus: sync.pending > 0 ? 'pending' : 'synced',
    syncError: sync.error ?? null,
    healthExportRequested: Boolean((queued?.payload ?? payload).health_export_requested),
  };
}

/** Existing callers retain their synchronous-save contract and Promise<string> result. */
export async function saveWorkout(
  userId: string,
  session: WorkoutSession,
  extra: { durationMin: number; calories: number | null; caloriesEstimated: boolean; notes?: string },
): Promise<string> {
  if (!userId) throw new Error('Sign in to save this workout.');
  const payload = completedWorkoutPayload(session, extra, true);
  return saveCompletedWorkoutRpc(userId, payload);
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

export interface WorkoutPreferences {
  user_id: string;
  last_routine_id: string | null;
  default_rest_seconds: number;
  auto_start_rest: boolean;
  updated_at?: string;
}

export async function loadWorkoutPreferences(userId?: string): Promise<WorkoutPreferences> {
  const owner = userId ?? await currentUserId();
  const { data, error } = await supabase.from('workout_preferences')
    .select('user_id, last_routine_id, default_rest_seconds, auto_start_rest, updated_at')
    .eq('user_id', owner).abortSignal(requestTimeout()).maybeSingle();
  if (error) {
    const cached = await cachedWorkoutHistory<WorkoutPreferences>(owner, 'preferences');
    if (cached) return cached;
    throw new Error(`Workout preferences are unavailable offline: ${error.message}`);
  }
  const preferences = data as WorkoutPreferences | null ?? {
    user_id: owner, last_routine_id: null, default_rest_seconds: 90, auto_start_rest: true,
  };
  await cacheWorkoutHistory(owner, 'preferences', preferences);
  return preferences;
}

export async function saveWorkoutPreferences(
  userId: string,
  preferences: Partial<Omit<WorkoutPreferences, 'user_id' | 'updated_at'>>,
): Promise<WorkoutPreferences> {
  const { data, error } = await supabase.from('workout_preferences').upsert({
    user_id: userId, ...preferences, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('user_id, last_routine_id, default_rest_seconds, auto_start_rest, updated_at').single();
  if (error) throw new Error(error.message);
  const saved = data as WorkoutPreferences;
  await cacheWorkoutHistory(userId, 'preferences', saved);
  return saved;
}

export interface PlannedWorkoutRow {
  id: string;
  user_id: string;
  planned_for: string;
  name: string;
  routine_id: string | null;
  notes: string | null;
  snapshot: Pick<SessionItem, 'exercise' | 'sets' | 'restSeconds' | 'supersetId' | 'notes'>[];
  completed_workout_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function loadPlannedWorkouts(from: string, through: string): Promise<PlannedWorkoutRow[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from('planned_workouts')
    .select('id,user_id,planned_for,name,routine_id,notes,snapshot,completed_workout_id,created_at,updated_at')
    .gte('planned_for', from).lte('planned_for', through).order('planned_for').abortSignal(requestTimeout());
  if (error) {
    const snapshot = await getFitnessOfflineSnapshot(userId);
    const cached = snapshot.plannedWorkouts.filter((row) => row.planned_for >= from && row.planned_for <= through);
    if (cached.length || snapshot.history[`plans:${from}:${through}`]) return cached;
    throw new Error(`Planned workouts are unavailable offline: ${error.message}`);
  }
  const rows = data as PlannedWorkoutRow[];
  const snapshot = await getFitnessOfflineSnapshot(userId);
  const next = snapshot.plannedWorkouts.filter((row) => row.planned_for < from || row.planned_for > through);
  await cachePlannedWorkouts(userId, [...next, ...rows]);
  await cacheWorkoutHistory(userId, `plans:${from}:${through}`, true);
  return rows;
}

export async function savePlannedWorkout(
  userId: string,
  planned: Omit<PlannedWorkoutRow, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'completed_workout_id'> & { id?: string },
): Promise<PlannedWorkoutRow> {
  const id = asUUID(planned.id);
  const { data, error } = await supabase.from('planned_workouts').upsert({
    ...planned, id, user_id: userId, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('id,user_id,planned_for,name,routine_id,notes,snapshot,completed_workout_id,created_at,updated_at').single();
  if (error) throw new Error(error.message);
  const row = data as PlannedWorkoutRow;
  const cached = await getFitnessOfflineSnapshot(userId);
  await cachePlannedWorkouts(userId, [...cached.plannedWorkouts.filter((existing) => existing.id !== row.id), row]);
  return row;
}

export async function deletePlannedWorkout(userId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from('planned_workouts').delete().eq('id', id).eq('user_id', userId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('The planned workout was not deleted. Reload your plan and try again.');
  const cached = await getFitnessOfflineSnapshot(userId);
  await cachePlannedWorkouts(userId, cached.plannedWorkouts.filter((row) => row.id !== id));
}

export async function linkPlannedWorkoutCompletion(userId: string, plannedId: string, workoutId: string): Promise<void> {
  const { data, error } = await supabase.from('planned_workouts')
    .update({ completed_workout_id: workoutId, updated_at: new Date().toISOString() })
    .eq('id', plannedId).eq('user_id', userId).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('The workout was saved, but its plan link was not updated.');
}

export const loadWorkoutPlans = (date: string) => loadPlannedWorkouts(date, date);

export async function planWorkout(routine: RoutineRow, date: string, notes: string): Promise<PlannedWorkoutRow> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('Choose a valid calendar date for your workout.');
  }
  return savePlannedWorkout(await currentUserId(), {
    planned_for: date, name: routine.name, routine_id: routine.id,
    notes: notes.trim() || null, snapshot: routineToItems(routine),
  });
}

export async function startPlannedWorkout(plan: PlannedWorkoutRow): Promise<void> {
  const userId = await currentUserId();
  if (plan.user_id !== userId) throw new Error('This planned workout belongs to a different account.');
  if (plan.completed_workout_id) throw new Error('This planned workout has already been completed.');
  if (getSession().active) throw new Error('Finish or discard your active workout before starting another.');
  startSession(plan.name, plan.routine_id, plan.snapshot);
  updateSession((session) => ({ ...session, notes: plan.notes ?? '', plannedWorkoutId: plan.id }));
  await workoutSessionStore.retry();
}

export async function deleteWorkoutPlan(planId: string): Promise<void> {
  await deletePlannedWorkout(await currentUserId(), planId);
}

export async function setExerciseRest(exerciseId: string, seconds: number): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw new Error('Rest time must be from 0 to 3,600 seconds.');
  const userId = await currentUserId();
  await cacheExerciseRestSeconds(userId, exerciseId, seconds);
  if (workoutSessionStore.getAccount() !== userId) throw new Error('The workout account changed after saving this rest preference locally.');
  updateSession((session) => ({
    ...session,
    items: session.items.map((item) => item.exercise.id === exerciseId ? { ...item, restSeconds: seconds } : item),
  }));
}

/** Populate durable launch data without touching the active workout or its edited values. */
export async function primeWorkoutOfflineData(): Promise<void> {
  const userId = await currentUserId();
  await Promise.all([loadExercises(), loadRoutines(), loadRecentWorkouts(), loadWorkoutPreferences(userId)]);
  const rows: (HistoryRow & { exercise_id: string })[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('workout_exercises')
      .select('exercise_id,workout_id,workouts!inner(started_at,name),workout_sets(id,position,reps,weight_kg,is_warmup,duration_s,distance_m,completed_at,rpe)')
      .order('id').range(offset, offset + 499).abortSignal(requestTimeout());
    if (error) throw new Error(`Offline workout history could not refresh: ${error.message}`);
    const page = data as unknown as (HistoryRow & { exercise_id: string })[];
    rows.push(...page);
    if (page.length < 500) break;
  }
  const grouped = new Map<string, HistoryRow[]>();
  for (const row of rows) grouped.set(row.exercise_id, [...(grouped.get(row.exercise_id) ?? []), row]);
  await Promise.all([...grouped].map(([exerciseId, history]) =>
    cacheWorkoutHistory(userId, `exercise:${exerciseId}`, mapExerciseHistory(history))));
  const { data, error } = await supabase.from('exercise_rest_preferences').select('exercise_id,rest_seconds').eq('user_id', userId).abortSignal(requestTimeout());
  if (error) throw new Error(`Offline rest preferences could not refresh: ${error.message}`);
  await cacheWorkoutHistory(userId, 'restPreferences', data ?? []);
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
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('routines')
    .select('id, name, routine_exercises(id, position, exercise_id, target_sets, target_reps, target_weight_kg, target_duration_s, target_distance_m, exercises(*))')
    .order('updated_at', { ascending: false }).abortSignal(requestTimeout());
  if (error) {
    const cached = await getFitnessOfflineSnapshot(userId);
    if (cached.routinesCached || cached.routines.length) return cached.routines;
    throw new Error(`Workout routines are unavailable offline: ${error.message}`);
  }
  const routines = (data as unknown as RoutineRow[]).map((r) => ({ ...r, routine_exercises: [...r.routine_exercises].sort((a, b) => a.position - b.position) }));
  await cacheWorkoutRoutines(userId, routines);
  return routines;
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
  await removeCachedWorkout(await currentUserId(), id);
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
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('workouts')
    .select('id, name, started_at, duration_min, calories_burned, calories_estimated, source, workout_exercises(exercises(name))')
    .order('started_at', { ascending: false })
    .limit(limit).abortSignal(requestTimeout());
  if (error) {
    const cached = await cachedWorkoutHistory<WorkoutListRow[]>(userId, `recent:${limit}`);
    if (cached) return cached;
    throw new Error(`Workout history is unavailable offline: ${error.message}`);
  }
  const rows = data as unknown as WorkoutListRow[];
  await cacheWorkoutHistory(userId, `recent:${limit}`, rows);
  return rows;
}

export interface TrainingRow {
  exercise_id: string;
  exercises: Pick<Exercise, 'name' | 'muscle_groups' | 'category'>;
  workouts: { started_at: string };
  workout_sets: Pick<WorkoutSet, 'reps' | 'weight_kg' | 'is_warmup'>[];
}

/** All exercises logged since a date, with their sets, for weekly volume and muscle balance. */
export async function loadTraining(sinceIso: string): Promise<TrainingRow[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('exercise_id, exercises(name, muscle_groups, category), workouts!inner(started_at), workout_sets(reps, weight_kg, is_warmup)')
    .gte('workouts.started_at', sinceIso).abortSignal(requestTimeout());
  if (error) {
    const cached = await cachedWorkoutHistory<TrainingRow[]>(userId, `training:${sinceIso}`);
    if (cached) return cached;
    throw new Error(`Training history is unavailable offline: ${error.message}`);
  }
  const rows = data as unknown as TrainingRow[];
  await cacheWorkoutHistory(userId, `training:${sinceIso}`, rows);
  return rows;
}

/** Best-ever sets per exercise, for the records list. */
export async function loadAllTraining(): Promise<TrainingRow[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('exercise_id, exercises(name, muscle_groups, category), workouts!inner(started_at), workout_sets(reps, weight_kg, is_warmup)').abortSignal(requestTimeout());
  if (error) {
    const cached = await cachedWorkoutHistory<TrainingRow[]>(userId, 'training:all');
    if (cached) return cached;
    throw new Error(`Training records are unavailable offline: ${error.message}`);
  }
  const rows = data as unknown as TrainingRow[];
  await cacheWorkoutHistory(userId, 'training:all', rows);
  return rows;
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
