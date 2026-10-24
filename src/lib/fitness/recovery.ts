import type { WorkoutSession } from './session';

/** Active workouts never expire automatically; abandoning one is an explicit user action. */
export function isRecoverableWorkout(value: unknown, now = Date.now()): value is WorkoutSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as WorkoutSession;
  const nullableNumber = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value);
  const validRpe = (value: unknown) => value === undefined || value === null || Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
  return session.active === true && typeof session.name === 'string'
    && (session.routineId === null || typeof session.routineId === 'string')
    && Number.isFinite(session.startedAt) && session.startedAt > 0 && session.startedAt <= now
    && (session.sessionId === undefined || typeof session.sessionId === 'string')
    && (session.focusIndex === undefined || Number.isInteger(session.focusIndex) && session.focusIndex >= 0)
    && (session.restEndsAt === undefined || nullableNumber(session.restEndsAt))
    && (session.pausedAt === undefined || nullableNumber(session.pausedAt))
    && (session.totalPausedMs === undefined || Number.isFinite(session.totalPausedMs) && session.totalPausedMs >= 0)
    && (session.completedAt === undefined || session.completedAt === null || typeof session.completedAt === 'string')
    && (session.finishRating === undefined || session.finishRating === null || ['easy', 'right', 'hard'].includes(session.finishRating))
    && Array.isArray(session.items) && session.items.every((item) => item && typeof item.key === 'string'
      && (item.id === undefined || typeof item.id === 'string')
      && (item.restSeconds === undefined || Number.isFinite(item.restSeconds) && item.restSeconds >= 0)
      && (item.supersetId === undefined || item.supersetId === null || typeof item.supersetId === 'string')
      && (item.notes === undefined || typeof item.notes === 'string')
      && item.exercise && typeof item.exercise.id === 'string' && typeof item.exercise.name === 'string'
      && (item.exercise.category === 'strength' || item.exercise.category === 'cardio')
      && Number.isFinite(item.exercise.met) && item.exercise.met >= 0
      && Array.isArray(item.exercise.muscle_groups)
      && Array.isArray(item.sets) && item.sets.every((set) => set && typeof set.is_warmup === 'boolean'
        && (set.id === undefined || typeof set.id === 'string')
        && Number.isFinite(set.position) && nullableNumber(set.reps) && nullableNumber(set.weight_kg)
        && nullableNumber(set.duration_s) && nullableNumber(set.distance_m)
        && (set.completed === undefined || typeof set.completed === 'boolean')
        && (set.completed_at === undefined || set.completed_at === null || typeof set.completed_at === 'string')
        && validRpe(set.rpe)));
}

export function migrateWorkoutSession(session: WorkoutSession, uuid: () => string): WorkoutSession {
  const validUUID = (value?: string) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  return {
    ...session,
    sessionId: validUUID(session.sessionId) ? session.sessionId : uuid(),
    focusIndex: session.focusIndex ?? 0,
    pausedAt: session.pausedAt ?? null,
    totalPausedMs: session.totalPausedMs ?? 0,
    restEndsAt: session.restEndsAt ?? null,
    items: session.items.map((item) => {
      const id = validUUID(item.id) ? item.id! : validUUID(item.key) ? item.key : uuid();
      return {
        ...item, id, key: id,
        sets: item.sets.map((set) => ({
          ...set,
          id: validUUID(set.id) ? set.id : uuid(),
          completed: set.completed ?? Boolean(set.completed_at),
          completed_at: set.completed_at ?? null,
        })),
      };
    }),
  };
}
