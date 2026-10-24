import { WORKOUT_SESSION_TTL } from '../localRecovery';
import type { WorkoutSession } from './session';

/** A fresh save timestamp must not keep an old workout alive indefinitely. */
export function isRecoverableWorkout(value: unknown, now = Date.now()): value is WorkoutSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as WorkoutSession;
  const nullableNumber = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value);
  return session.active === true && typeof session.name === 'string'
    && (session.routineId === null || typeof session.routineId === 'string')
    && Number.isFinite(session.startedAt) && session.startedAt > 0 && session.startedAt <= now
    && now - session.startedAt < WORKOUT_SESSION_TTL
    && Array.isArray(session.items) && session.items.every((item) => item && typeof item.key === 'string'
      && item.exercise && typeof item.exercise.id === 'string' && typeof item.exercise.name === 'string'
      && (item.exercise.category === 'strength' || item.exercise.category === 'cardio')
      && Number.isFinite(item.exercise.met) && item.exercise.met >= 0
      && Array.isArray(item.exercise.muscle_groups)
      && Array.isArray(item.sets) && item.sets.every((set) => set && typeof set.is_warmup === 'boolean'
        && Number.isFinite(set.position) && nullableNumber(set.reps) && nullableNumber(set.weight_kg)
        && nullableNumber(set.duration_s) && nullableNumber(set.distance_m)));
}
