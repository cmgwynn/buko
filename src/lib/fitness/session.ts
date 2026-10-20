import { useSyncExternalStore } from 'react';
import type { Exercise, WorkoutSet } from './types';

/** The in-progress workout. Held in memory only; it is saved to Supabase when the user taps Finish. */
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

let current: WorkoutSession = empty();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let counter = 0;
const nextKey = () => `i${Date.now()}_${counter++}`;

export const blankSet = (position: number, from?: Partial<WorkoutSet>): WorkoutSet => ({
  position, reps: null, weight_kg: null, is_warmup: false, duration_s: null, distance_m: null, ...from,
});

export function getSession() {
  return current;
}

export function startSession(name = 'Workout', routineId: string | null = null, items: { exercise: Exercise; sets: WorkoutSet[] }[] = []) {
  current = { active: true, name, startedAt: Date.now(), routineId, items: items.map((i) => ({ key: nextKey(), ...i })) };
  emit();
}

export function endSession() {
  current = empty();
  emit();
}

export function updateSession(fn: (s: WorkoutSession) => WorkoutSession) {
  current = fn(current);
  emit();
}

export function addExercise(exercise: Exercise, sets?: WorkoutSet[]) {
  updateSession((s) => ({
    ...s,
    items: [...s.items, { key: nextKey(), exercise, sets: sets?.length ? sets : [blankSet(0)] }],
  }));
}

export function useWorkoutSession(): WorkoutSession {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
