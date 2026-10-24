import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRecoveryStore } from '../localRecovery';
import {
  adjustRestTimer, completeSet, focusExercise, pauseWorkout as pauseWorkoutState, resumeWorkout as resumeWorkoutState,
  stopRestTimer, swapExercise, undoSet,
} from './engine';
import { activateFitnessOfflineAccount, cachedWorkoutHistory, getFitnessOfflineSnapshot } from './offline';
import { applyHistoryPrefill, type CachedExerciseHistory } from './prefill';
import { isRecoverableWorkout, migrateWorkoutSession } from './recovery';
import { stableUUID } from './ids';
import type { Exercise, WorkoutSet } from './types';

/** The in-progress workout, recovered locally until Finish saves it to Supabase. */
export interface SessionItem {
  key: string;
  id?: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  restSeconds?: number;
  supersetId?: string | null;
  notes?: string;
  initialSets?: WorkoutSet[];
}
export interface WorkoutSession {
  active: boolean;
  name: string;
  startedAt: number;
  routineId: string | null;
  items: SessionItem[];
  id?: string;
  sessionId?: string;
  focusIndex?: number;
  restEndsAt?: number | null;
  pausedAt?: number | null;
  totalPausedMs?: number;
  completedAt?: string | null;
  notes?: string;
  historyPrefillApplied?: boolean;
  plannedWorkoutId?: string | null;
  autoStartRest?: boolean;
  finishRating?: 'easy' | 'right' | 'hard' | null;
}

const empty = (): WorkoutSession => ({
  active: false, name: '', startedAt: 0, routineId: null, items: [],
  focusIndex: 0, restEndsAt: null, pausedAt: null, totalPausedMs: 0, completedAt: null,
  historyPrefillApplied: false,
});

const sessionRecoveryStore = createRecoveryStore<WorkoutSession>({
  kind: 'workout', ttl: Infinity, keepPreviousAccount: true, storage: {
    ...AsyncStorage,
    async getItem(key: string) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      let record: { value?: unknown };
      try { record = JSON.parse(raw); } catch { return raw; }
      if (!isRecoverableWorkout(record.value)) return raw;
      const encoded = JSON.stringify({ ...record, value: migrateWorkoutSession(record.value, stableUUID) });
      if (encoded !== raw) await AsyncStorage.setItem(key, encoded);
      return encoded;
    },
  }, empty,
  isEmpty: (session) => !session.active,
  validate: isRecoverableWorkout,
});

export const workoutSessionStore = {
  ...sessionRecoveryStore,
  async setAccount(userId: string | null, retryRead = false) {
    await sessionRecoveryStore.setAccount(userId, retryRead);
    if (userId && sessionRecoveryStore.getAccount() === userId) activateFitnessOfflineAccount(userId);
  },
};

export const blankSet = (position: number, from?: Partial<WorkoutSet>): WorkoutSet => ({
  reps: null, weight_kg: null, is_warmup: false, duration_s: null, distance_m: null,
  rpe: null, ...from, id: stableUUID(), position, completed: false, completed_at: null, prefillEditedFields: [],
});

const withStableIds = (items: { exercise: Exercise; sets: WorkoutSet[]; restSeconds?: number; supersetId?: string | null; notes?: string }[]): SessionItem[] =>
  items.map((item) => {
    const id = stableUUID();
    const sets = item.sets.map((set) => ({ ...set, id: stableUUID(), completed: false, completed_at: null, prefillEditedFields: [] }));
    return {
      key: id,
      id,
      ...item,
      restSeconds: item.restSeconds ?? 90,
      sets,
      initialSets: sets.map((set) => ({ ...set })),
    };
  });

export function getSession() {
  return workoutSessionStore.get();
}

export function startSession(
  name = 'Workout',
  routineId: string | null = null,
  items: { exercise: Exercise; sets: WorkoutSet[]; restSeconds?: number; supersetId?: string | null; notes?: string }[] = [],
) {
  if (getSession().active) throw new Error('Finish or discard your active workout before starting another.');
  workoutSessionStore.set({
    active: true, sessionId: stableUUID(), name, startedAt: Date.now(), routineId,
    items: withStableIds(items), focusIndex: 0, restEndsAt: null, pausedAt: null, totalPausedMs: 0,
    completedAt: null, notes: '', historyPrefillApplied: false,
  });
}

export function endSession() {
  return workoutSessionStore.clear();
}

export function updateSession(fn: (s: WorkoutSession) => WorkoutSession) {
  setSession(fn, true);
}

function setSession(fn: (s: WorkoutSession) => WorkoutSession, trackEdits: boolean) {
  const previous = getSession();
  const next = fn(previous);
  if (!trackEdits) { workoutSessionStore.set(next); return; }
  workoutSessionStore.set({
    ...next,
    items: next.items.map((item) => {
      const oldItem = previous.items.find((candidate) => candidate.key === item.key);
      if (!oldItem) return item;
      return {
        ...item,
        sets: item.sets.map((set) => {
          const before = oldItem.sets.find((candidate) => candidate.id === set.id);
          if (!before) return set;
          const edited = ['reps', 'weight_kg', 'duration_s', 'distance_m'] as const;
          const changed = edited.filter((field) => before[field] !== set[field]);
          return changed.length
            ? { ...set, prefillEditedFields: [...new Set([...(set.prefillEditedFields ?? []), ...changed])] }
            : set;
        }),
      };
    }),
  });
}

export function addExercise(exercise: Exercise, sets?: WorkoutSet[]) {
  updateSession((s) => ({
    ...s,
    items: [...s.items, ...withStableIds([{ exercise, sets: sets?.length ? sets : [blankSet(0)] }])],
  }));
}

export function completeSessionSet(itemKey: string, setIndex: number, at = Date.now()) {
  updateSession((session) => {
    const item = session.items.find((candidate) => candidate.key === itemKey || candidate.id === itemKey);
    if (!item || !item.sets[setIndex]) throw new Error('That workout set is no longer available.');
    const completed = completeSet(session, itemKey, setIndex, at);
    return completed;
  });
}

export function undoSessionSet(itemKey: string, setIndex: number) {
  updateSession((session) => {
    const item = session.items.find((candidate) => candidate.key === itemKey || candidate.id === itemKey);
    if (!item || !item.sets[setIndex]) throw new Error('That workout set is no longer available.');
    return stopRestTimer(undoSet(session, itemKey, setIndex));
  });
}

export function focusSessionExercise(index: number) {
  updateSession((session) => focusExercise(session, index));
}

export function adjustSessionRest(deltaSeconds: number, now = Date.now()) {
  updateSession((session) => adjustRestTimer(session, deltaSeconds, now));
}

export const adjustRest = adjustSessionRest;

export function pauseSession(at = Date.now()) {
  updateSession((session) => pauseWorkoutState(session, at));
}

export function resumeSession(at = Date.now()) {
  updateSession((session) => resumeWorkoutState(session, at));
}

export const pauseWorkout = pauseSession;
export const resumeWorkout = resumeSession;

export function swapSessionExercise(itemKey: string, exercise: Exercise) {
  updateSession((session) => swapExercise(session, itemKey, exercise, stableUUID));
}

/** Applies cached last-session values once, before edits; the routine's saved values remain the fallback. */
export async function prefillSessionHistory(): Promise<boolean> {
  const session = getSession();
  if (!session.active || session.historyPrefillApplied) return false;
  const owner = workoutSessionStore.getAccount();
  if (!owner) throw new Error('Wait for account recovery before applying workout history.');
  const snapshot = await getFitnessOfflineSnapshot(owner);
  const histories = await Promise.all(session.items.map(async (item) => {
    const cached = await cachedWorkoutHistory<CachedExerciseHistory>(owner, `exercise:${item.exercise.id}`);
    return [item.exercise.id, cached ?? { sessions: [] }] as const;
  }));
  let applied = false;
  setSession((current) => {
    if (workoutSessionStore.getAccount() !== owner || !current.active || current.sessionId !== session.sessionId || current.historyPrefillApplied) return current;
    applied = true;
    const prefilled = applyHistoryPrefill(current, session, Object.fromEntries(histories));
    const preferences = snapshot.history.preferences as { auto_start_rest?: boolean; default_rest_seconds?: number } | undefined;
    const restPreferences = snapshot.history.restPreferences as { exercise_id: string; rest_seconds: number }[] | undefined;
    return { ...prefilled, autoStartRest: preferences?.auto_start_rest ?? true, items: prefilled.items.map((item) => ({
      ...item,
      restSeconds: item.restSeconds !== session.items.find((old) => old.key === item.key)?.restSeconds
        ? item.restSeconds
        : snapshot.exerciseRestSeconds[item.exercise.id]
          ?? restPreferences?.find((row) => row.exercise_id === item.exercise.id)?.rest_seconds
          ?? preferences?.default_rest_seconds ?? item.restSeconds ?? 90,
    })) };
  }, false);
  return applied;
}

export function useWorkoutSession(): WorkoutSession {
  return useSyncExternalStore(workoutSessionStore.subscribe, workoutSessionStore.get);
}

export function useWorkoutRecovery() {
  return useSyncExternalStore(workoutSessionStore.subscribe, workoutSessionStore.getRecovery);
}

export const prepareWorkoutSave = workoutSessionStore.prepareToComplete;
