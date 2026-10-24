import type { Exercise } from './types';
import type { PlannedWorkoutRow, RoutineRow } from './data';
import type { RecoveryStorage } from '../localRecovery';
import type { RecordKind } from './calc';

export const fitnessOfflineKey = (userId: string) => `buko:fitness:offline:${userId}`;

export interface QueuedWorkout {
  id: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  summary?: WorkoutSummary;
  syncStatus?: 'pending' | 'synced' | 'error';
  syncError?: string;
}

export interface WorkoutSummary {
  durationSec: number;
  volumeKg: number;
  completedSets: number;
  records: WorkoutRecord[];
}

export interface WorkoutRecord {
  exerciseId: string;
  exerciseName: string;
  kind: RecordKind;
  value: number;
  previousValue: number;
}

export interface FitnessOfflineSnapshot {
  version: 1;
  userId: string;
  catalog: Exercise[];
  routines: RoutineRow[];
  plannedWorkouts: PlannedWorkoutRow[];
  history: Record<string, unknown>;
  outbox: QueuedWorkout[];
  finishedWorkouts: QueuedWorkout[];
  exerciseRestSeconds: Record<string, number>;
  restPreferenceOutbox: { exerciseId: string; restSeconds: number; queuedAt: string }[];
  catalogCached?: boolean;
  routinesCached?: boolean;
  healthReceipts?: Record<string, string>;
  updatedAt: string;
}

const emptySnapshot = (userId: string): FitnessOfflineSnapshot => ({
  version: 1, userId, catalog: [], routines: [], plannedWorkouts: [], history: {}, outbox: [], finishedWorkouts: [],
  exerciseRestSeconds: {}, restPreferenceOutbox: [], updatedAt: new Date(0).toISOString(),
});

export class FitnessOfflineError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FitnessOfflineError';
  }
}

export function createFitnessOfflineStore(deps: {
  storage: RecoveryStorage;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }>;
  account?(): string | null;
}) {
const AsyncStorage = deps.storage;
const supabase = { rpc: deps.rpc };
function checkOwner(userId: string) {
  if (!userId || deps.account && deps.account() !== userId) throw new FitnessOfflineError('The workout account changed. Return to the signed-in account before changing or syncing its offline data.');
}
async function readSnapshot(userId: string): Promise<FitnessOfflineSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(fitnessOfflineKey(userId));
    if (!raw) return emptySnapshot(userId);
    const value = JSON.parse(raw) as Partial<FitnessOfflineSnapshot>;
    if (value.version !== 1 || value.userId !== userId || !Array.isArray(value.catalog)
      || !Array.isArray(value.routines) || !Array.isArray(value.plannedWorkouts)
      || !value.history || typeof value.history !== 'object'
      || !Array.isArray(value.outbox) || !Array.isArray(value.finishedWorkouts)
      || !value.exerciseRestSeconds || typeof value.exerciseRestSeconds !== 'object'
      || !Array.isArray(value.restPreferenceOutbox)) {
      throw new Error('The saved workout data is invalid.');
    }
    return value as FitnessOfflineSnapshot;
  } catch (error) {
    throw new FitnessOfflineError('Workout data could not be read from this device. Keep this account signed in and retry.', { cause: error });
  }
}

async function writeSnapshot(userId: string, snapshot: FitnessOfflineSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(fitnessOfflineKey(userId), JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }));
  } catch (error) {
    throw new FitnessOfflineError('Workout data could not be saved on this device. Keep the workout open and retry before leaving.', { cause: error });
  }
}

const mutationQueues = new Map<string, Promise<unknown>>();
const revokedAccounts = new Set<string>();
function mutateSnapshot<T>(userId: string, mutate: (snapshot: FitnessOfflineSnapshot) => FitnessOfflineSnapshot): Promise<FitnessOfflineSnapshot> {
  const previous = mutationQueues.get(userId) ?? Promise.resolve();
  const operation = previous.then(async () => {
    checkOwner(userId);
    if (revokedAccounts.has(userId)) throw new FitnessOfflineError('This account’s offline workout data is being cleared and cannot be changed.');
    const snapshot = await readSnapshot(userId);
    const next = mutate(snapshot);
    await writeSnapshot(userId, next);
    return next;
  });
  mutationQueues.set(userId, operation.catch(() => {}));
  return operation;
}

async function getFitnessOfflineSnapshot(userId: string): Promise<FitnessOfflineSnapshot> {
  if (!userId) throw new FitnessOfflineError('A signed-in account is required to read offline workout data.');
  return readSnapshot(userId);
}

async function cacheWorkoutCatalog(userId: string, catalog: Exercise[]): Promise<void> {
  await mutateSnapshot(userId, (snapshot) => ({ ...snapshot, catalog, catalogCached: true }));
}

async function cacheWorkoutRoutines(userId: string, routines: RoutineRow[]): Promise<void> {
  await mutateSnapshot(userId, (snapshot) => ({ ...snapshot, routines, routinesCached: true }));
}

async function cachePlannedWorkouts(userId: string, plannedWorkouts: PlannedWorkoutRow[]): Promise<void> {
  await mutateSnapshot(userId, (snapshot) => ({ ...snapshot, plannedWorkouts }));
}

async function cacheWorkoutHistory<T>(userId: string, key: string, value: T): Promise<void> {
  await mutateSnapshot(userId, (snapshot) => {
    let cached: unknown = value;
    if (key.startsWith('exercise:')) {
      type History = { sessions: { workoutId: string; date: string; sets: object[] }[]; dated?: unknown[] };
      const incoming = value as History;
      const existing = snapshot.history[key] as History | undefined;
      if (Array.isArray(incoming.sessions) && existing?.sessions) {
        const localIds = new Set(snapshot.finishedWorkouts.map((entry) => entry.id));
        const seen = new Set(incoming.sessions.map((entry) => entry.workoutId));
        const sessions = [
          ...existing.sessions.filter((entry) => localIds.has(entry.workoutId) && !seen.has(entry.workoutId)),
          ...incoming.sessions,
        ];
        cached = { ...incoming, sessions, dated: sessions.flatMap((session) => session.sets.map((set) => ({ ...set, date: session.date }))) };
      }
    }
    return { ...snapshot, history: { ...snapshot.history, [key]: cached } };
  });
}

async function removeCachedWorkout(userId: string, workoutId: string): Promise<void> {
  await mutateSnapshot(userId, (snapshot) => {
    const history = { ...snapshot.history };
    for (const [key, value] of Object.entries(history)) {
      if (!key.startsWith('exercise:')) continue;
      const cached = value as { sessions: { workoutId: string; date: string; sets: object[] }[] };
      if (!Array.isArray(cached?.sessions)) continue;
      const sessions = cached.sessions.filter((session) => session.workoutId !== workoutId);
      history[key] = { ...cached, sessions, dated: sessions.flatMap((session) => session.sets.map((set) => ({ ...set, date: session.date }))) };
    }
    return {
      ...snapshot, history,
      finishedWorkouts: snapshot.finishedWorkouts.filter((entry) => entry.id !== workoutId),
      outbox: snapshot.outbox.filter((entry) => entry.id !== workoutId),
    };
  });
}

async function cacheExerciseRestSeconds(userId: string, exerciseId: string, restSeconds: number): Promise<void> {
  await mutateSnapshot(userId, (snapshot) => ({
    ...snapshot,
    exerciseRestSeconds: { ...snapshot.exerciseRestSeconds, [exerciseId]: restSeconds },
    restPreferenceOutbox: [
      ...snapshot.restPreferenceOutbox.filter((entry) => entry.exerciseId !== exerciseId),
      { exerciseId, restSeconds, queuedAt: new Date().toISOString() },
    ],
  }));
}

async function cachedExerciseRestSeconds(userId: string, exerciseId: string): Promise<number | null> {
  return (await readSnapshot(userId)).exerciseRestSeconds[exerciseId] ?? null;
}

async function cachedWorkoutHistory<T>(userId: string, key: string): Promise<T | null> {
  const snapshot = await readSnapshot(userId);
  return (snapshot.history[key] as T | undefined) ?? null;
}

async function queueCompletedWorkout(
  userId: string,
  id: string,
  payload: Record<string, unknown>,
  summary?: WorkoutSummary,
): Promise<void> {
  if (!userId || !id) throw new FitnessOfflineError('A signed-in account and workout ID are required to queue this workout.');
  await mutateSnapshot(userId, (snapshot) => snapshot.finishedWorkouts.some((entry) => entry.id === id)
    ? snapshot
    : {
      ...snapshot,
      outbox: [...snapshot.outbox, { id, payload, queuedAt: new Date().toISOString(), summary, syncStatus: 'pending' }],
      finishedWorkouts: [
        ...snapshot.finishedWorkouts.filter((entry) => entry.id !== id),
        { id, payload, queuedAt: new Date().toISOString(), summary, syncStatus: 'pending' },
      ],
      history: addFinishedHistory(snapshot.history, id, payload),
    });
}

function addFinishedHistory(history: Record<string, unknown>, id: string, payload: Record<string, unknown>) {
  const next = { ...history };
  const items = payload.items as { exercise_id: string; sets: unknown[] }[];
  if (!Array.isArray(items)) return next;
  const started = new Date(payload.started_at as string);
  const date = `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}-${String(started.getDate()).padStart(2, '0')}`;
  for (const item of items) {
    const key = `exercise:${item.exercise_id}`;
    const previous = next[key] as { sessions?: { workoutId: string; date: string; workoutName: string; sets: unknown[] }[]; dated?: unknown[] } | undefined;
    const sessions = [
      { workoutId: id, date, workoutName: payload.name as string, sets: item.sets },
      ...(previous?.sessions ?? []).filter((session) => session.workoutId !== id),
    ];
    next[key] = {
      sessions,
      dated: sessions.flatMap((session) => session.sets.map((set) => ({ ...(set as object), date: session.date }))),
    };
  }
  return next;
}

async function recordHealthExportReceipt(userId: string, workoutId: string, externalId: string): Promise<void> {
  if (!externalId) throw new FitnessOfflineError('The health app did not confirm an export identifier.');
  await mutateSnapshot(userId, (snapshot) => ({
    ...snapshot, healthReceipts: { ...snapshot.healthReceipts, [workoutId]: externalId },
  }));
}

async function pendingWorkoutCount(userId: string): Promise<number> {
  const snapshot = await readSnapshot(userId);
  return snapshot.outbox.length + snapshot.restPreferenceOutbox.length;
}

async function listQueuedWorkouts(userId: string): Promise<QueuedWorkout[]> {
  return (await readSnapshot(userId)).outbox;
}

async function getFinishedWorkout(userId: string, id: string): Promise<QueuedWorkout | null> {
  return (await readSnapshot(userId)).finishedWorkouts.find((entry) => entry.id === id) ?? null;
}

async function discardPendingWorkouts(userId: string): Promise<number> {
  let discarded = 0;
  await mutateSnapshot(userId, (snapshot) => {
    discarded = snapshot.outbox.length + snapshot.restPreferenceOutbox.length;
    return { ...snapshot, outbox: [], restPreferenceOutbox: [] };
  });
  return discarded;
}

/** Refuses to delete unsynced work unless the caller explicitly authorizes discarding it. */
async function purgeFitnessOfflineData(userId: string, options: { discardPending?: boolean } = {}): Promise<void> {
  if (!userId) throw new FitnessOfflineError('A signed-in account is required to clear offline workout data.');
  revokedAccounts.add(userId);
  const previous = mutationQueues.get(userId) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const snapshot = await readSnapshot(userId);
    if ((snapshot.outbox.length || snapshot.restPreferenceOutbox.length) && options.discardPending !== true) {
      revokedAccounts.delete(userId);
      throw new FitnessOfflineError('Unsynced workouts are preserved on this device. Sync them before clearing offline data.');
    }
    try {
      await AsyncStorage.removeItem(fitnessOfflineKey(userId));
    } catch (error) {
      throw new FitnessOfflineError('Offline workout data could not be cleared from this device.', { cause: error });
    }
  });
  mutationQueues.set(userId, operation.catch(() => {}));
  await operation;
}

const syncQueues = new Map<string, Promise<{ pending: number; error?: string }>>();

/** Replays are safe: workout and child ids are client-generated and the owner RPC is idempotent. */
function syncPendingWorkouts(userId: string): Promise<{ pending: number; error?: string }> {
  const existing = syncQueues.get(userId);
  if (existing) return existing;
  const operation = (async () => {
    if (!userId) throw new FitnessOfflineError('A signed-in account is required to sync workouts.');
    let snapshot = await readSnapshot(userId);
    while (snapshot.restPreferenceOutbox.length) {
      checkOwner(userId);
      const preference = snapshot.restPreferenceOutbox[0];
      const { error } = await supabase.rpc('save_exercise_rest_preference', {
        p_exercise_id: preference.exerciseId,
        p_rest_seconds: preference.restSeconds,
        p_expected_user_id: userId,
      });
      if (error) return {
        pending: snapshot.outbox.length + snapshot.restPreferenceOutbox.length,
        error: `Rest preference could not sync: ${error.message}`,
      };
      snapshot = await mutateSnapshot(userId, (current) => ({
        ...current,
        restPreferenceOutbox: current.restPreferenceOutbox.filter((entry) => entry.exerciseId !== preference.exerciseId || entry.queuedAt !== preference.queuedAt || entry.restSeconds !== preference.restSeconds),
      }));
    }
    while (snapshot.outbox.length) {
      checkOwner(userId);
      const pending = snapshot.outbox[0];
      const { error } = await supabase.rpc('save_completed_workout', {
        p_payload: pending.payload,
        p_expected_user_id: userId,
      });
      if (error) {
        const message = `Workout ${pending.id} is still saved on this device and could not sync: ${error.message}`;
        snapshot = await mutateSnapshot(userId, (current) => ({
          ...current,
          finishedWorkouts: current.finishedWorkouts.map((entry) => entry.id === pending.id
            ? { ...entry, syncStatus: 'error', syncError: message }
            : entry),
        }));
        return { pending: snapshot.outbox.length + snapshot.restPreferenceOutbox.length, error: message };
      }
      snapshot = await mutateSnapshot(userId, (current) => ({
        ...current,
        outbox: current.outbox.filter((entry) => entry.id !== pending.id),
        finishedWorkouts: current.finishedWorkouts.map((entry) => entry.id === pending.id
          ? { ...entry, syncStatus: 'synced', syncError: undefined }
          : entry),
      }));
    }
    return { pending: snapshot.outbox.length + snapshot.restPreferenceOutbox.length };
  })();
  syncQueues.set(userId, operation);
  return operation.finally(() => {
    if (syncQueues.get(userId) === operation) syncQueues.delete(userId);
  });
}
return {
  getFitnessOfflineSnapshot, cacheWorkoutCatalog, cacheWorkoutRoutines, cachePlannedWorkouts,
  cacheWorkoutHistory, cachedWorkoutHistory, cacheExerciseRestSeconds, cachedExerciseRestSeconds,
  queueCompletedWorkout, pendingWorkoutCount, listQueuedWorkouts, getFinishedWorkout,
  discardPendingWorkouts, purgeFitnessOfflineData, syncPendingWorkouts,
  recordHealthExportReceipt,
  removeCachedWorkout,
  activateFitnessOfflineAccount(userId: string) { revokedAccounts.delete(userId); },
};
}
