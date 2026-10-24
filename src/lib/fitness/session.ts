import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRecoveryStore, WORKOUT_SESSION_TTL } from '../localRecovery';
import { isRecoverableWorkout } from './recovery';
import type { Exercise, WorkoutSet } from './types';

/** The in-progress workout, recovered locally until Finish saves it to Supabase. */
export interface SessionItem {
  key: string;
  exercise: Exercise;
  sets: WorkoutSet[];
}
export interface WorkoutSession {
  active: boolean;
  name: string;
  startedAt: number;
  routineId: string | null;
  items: SessionItem[];
}

const empty = (): WorkoutSession => ({ active: false, name: '', startedAt: 0, routineId: null, items: [] });

export const workoutSessionStore = createRecoveryStore<WorkoutSession>({
  kind: 'workout', ttl: WORKOUT_SESSION_TTL, storage: AsyncStorage, empty,
  isEmpty: (session) => !session.active,
  validate: isRecoverableWorkout,
});

let counter = 0;
const nextKey = () => `i${Date.now()}_${counter++}`;

export const blankSet = (position: number, from?: Partial<WorkoutSet>): WorkoutSet => ({
  position, reps: null, weight_kg: null, is_warmup: false, duration_s: null, distance_m: null, ...from,
});

export function getSession() {
  return workoutSessionStore.get();
}

export function startSession(name = 'Workout', routineId: string | null = null, items: { exercise: Exercise; sets: WorkoutSet[] }[] = []) {
  workoutSessionStore.set({ active: true, name, startedAt: Date.now(), routineId, items: items.map((i) => ({ key: nextKey(), ...i })) });
}

export function endSession() {
  return workoutSessionStore.clear();
}

export function updateSession(fn: (s: WorkoutSession) => WorkoutSession) {
  workoutSessionStore.set(fn(getSession()));
}

export function addExercise(exercise: Exercise, sets?: WorkoutSet[]) {
  updateSession((s) => ({
    ...s,
    items: [...s.items, { key: nextKey(), exercise, sets: sets?.length ? sets : [blankSet(0)] }],
  }));
}

export function useWorkoutSession(): WorkoutSession {
  return useSyncExternalStore(workoutSessionStore.subscribe, workoutSessionStore.get);
}

export function useWorkoutRecovery() {
  return useSyncExternalStore(workoutSessionStore.subscribe, workoutSessionStore.getRecovery);
}

export const prepareWorkoutSave = workoutSessionStore.prepareToComplete;
