import type { WorkoutSession, SessionItem } from './session';
import type { Exercise, WorkoutSet } from './types';

const itemIndex = (session: WorkoutSession, itemId: string) =>
  session.items.findIndex((item) => item.id === itemId || item.key === itemId);

const setIndex = (item: SessionItem, setId: string | number) =>
  typeof setId === 'number'
    ? Number.isInteger(setId) && setId >= 0 && setId < item.sets.length ? setId : -1
    : item.sets.findIndex((set) => set.id === setId);

export const isSetCompleted = (set: WorkoutSet) => set.completed === true || set.completed_at != null;
const completed = isSetCompleted;

export function validateSet(set: WorkoutSet, category: 'strength' | 'cardio'): void {
  const optional = (value: number | null, max: number, integer = false) =>
    value === null || Number.isFinite(value) && value >= 0 && value <= max && (!integer || Number.isInteger(value));
  if (!optional(set.reps, 1000, true) || !optional(set.weight_kg, 1500)
    || !optional(set.duration_s, 31_536_000, true) || !optional(set.distance_m, 100_000_000)) {
    throw new Error('Enter valid nonnegative set values within the allowed limits.');
  }
  if (set.rpe != null && (!Number.isInteger(set.rpe) || set.rpe < 1 || set.rpe > 10)) {
    throw new Error('Set effort (RPE) must be an integer from 1 to 10.');
  }
  if (category === 'strength' && (set.reps ?? 0) <= 0) throw new Error('Enter reps before completing this set.');
  if (category === 'cardio' && (set.duration_s ?? 0) <= 0 && (set.distance_m ?? 0) <= 0) {
    throw new Error('Enter a duration or distance before completing this set.');
  }
}

function updateSet(
  session: WorkoutSession,
  itemId: string,
  setId: string | number,
  update: (set: WorkoutSet) => WorkoutSet,
): WorkoutSession {
  const index = itemIndex(session, itemId);
  if (index < 0) return session;
  const item = session.items[index];
  const target = setIndex(item, setId);
  if (target < 0) return session;
  const sets = item.sets.map((set, i) => i === target ? update(set) : set);
  return {
    ...session,
    focusIndex: index,
    items: session.items.map((candidate, i) => i === index ? { ...candidate, sets } : candidate),
  };
}

export function completeSet(session: WorkoutSession, itemId: string, setId: string | number, at = Date.now()): WorkoutSession {
  if (session.pausedAt != null) throw new Error('Resume the workout before completing a set.');
  const index = itemIndex(session, itemId);
  if (index < 0) throw new Error('That workout exercise is no longer available.');
  const item = session.items[index];
  const target = setIndex(item, setId);
  if (target < 0) throw new Error('That workout set is no longer available.');
  if (completed(item.sets[target])) return session;
  validateSet(item.sets[target], item.exercise.category);
  const next = updateSet(session, itemId, setId, (set) => ({
    ...set,
    completed: true,
    completed_at: set.completed_at ?? new Date(at).toISOString(),
  }));
  if (item.supersetId) {
    const group = next.items.flatMap((candidate, i) => candidate.supersetId === item.supersetId ? [i] : []);
    const after = group.filter((i) => i > index).concat(group.filter((i) => i < index));
    const nextPartner = after.find((i) => next.items[i].sets.some((set, n) => n <= target && !completed(set)));
    if (nextPartner !== undefined) return { ...next, focusIndex: nextPartner, restEndsAt: null };
    const nextRound = group.find((i) => next.items[i].sets.some((set) => !completed(set)));
    const rested = item.restSeconds && session.autoStartRest !== false ? startRestTimer(next, item.restSeconds, at) : next;
    return nextRound === undefined ? advanceSession(rested) : { ...rested, focusIndex: nextRound };
  }
  const rested = item.restSeconds && session.autoStartRest !== false ? startRestTimer(next, item.restSeconds, at) : next;
  return next.items[index].sets.every(completed) ? advanceSession(rested) : rested;
}

export function undoSet(session: WorkoutSession, itemId: string, setId: string | number): WorkoutSession {
  return updateSet(session, itemId, setId, (set) => ({ ...set, completed: false, completed_at: null }));
}

export function focusExercise(session: WorkoutSession, index: number): WorkoutSession {
  return Number.isInteger(index) && index >= 0 && index < session.items.length
    ? { ...session, focusIndex: index }
    : session;
}

/** Focus the next item with an incomplete set, wrapping around once. */
export function advanceSession(session: WorkoutSession): WorkoutSession {
  if (!session.items.length) return session;
  const current = Math.max(0, Math.min(session.focusIndex ?? 0, session.items.length - 1));
  for (let step = 1; step <= session.items.length; step++) {
    const index = (current + step) % session.items.length;
    if (session.items[index].sets.some((set) => !completed(set))) return { ...session, focusIndex: index };
  }
  return session;
}

export function assignSuperset(session: WorkoutSession, itemIds: string[], supersetId: string): WorkoutSession {
  const selected = new Set(itemIds);
  if (selected.size < 2 || !supersetId) return session;
  return {
    ...session,
    items: session.items.map((item) => selected.has(item.id ?? item.key) || selected.has(item.key)
      ? { ...item, supersetId }
      : item),
  };
}

export function clearSuperset(session: WorkoutSession, supersetId: string): WorkoutSession {
  return { ...session, items: session.items.map((item) => item.supersetId === supersetId ? { ...item, supersetId: null } : item) };
}

export function startRestTimer(session: WorkoutSession, seconds: number, now = Date.now()): WorkoutSession {
  if (!Number.isFinite(seconds) || seconds <= 0 || session.pausedAt != null) return session;
  return { ...session, restEndsAt: now + Math.round(seconds * 1000) };
}

export function adjustRestTimer(session: WorkoutSession, seconds: number, now = Date.now()): WorkoutSession {
  if (session.restEndsAt == null || !Number.isFinite(seconds)) return session;
  const reference = session.pausedAt ?? now;
  const next = Math.max(reference, Math.max(reference, session.restEndsAt) + Math.round(seconds * 1000));
  return { ...session, restEndsAt: next <= reference ? null : next };
}

export function stopRestTimer(session: WorkoutSession): WorkoutSession {
  return session.restEndsAt == null ? session : { ...session, restEndsAt: null };
}

export function pauseWorkout(session: WorkoutSession, at = Date.now()): WorkoutSession {
  return session.pausedAt != null ? session : { ...session, pausedAt: at };
}

export function resumeWorkout(session: WorkoutSession, at = Date.now()): WorkoutSession {
  if (session.pausedAt == null) return session;
  const pausedFor = Math.max(0, at - session.pausedAt);
  return {
    ...session,
    pausedAt: null,
    totalPausedMs: (session.totalPausedMs ?? 0) + pausedFor,
    restEndsAt: session.restEndsAt == null ? null : session.restEndsAt + pausedFor,
  };
}

export function workoutDurationMs(session: WorkoutSession, now = Date.now()): number {
  if (!Number.isFinite(session.startedAt) || session.startedAt <= 0) return 0;
  const activePause = session.pausedAt == null ? 0 : Math.max(0, now - session.pausedAt);
  return Math.max(0, now - session.startedAt - (session.totalPausedMs ?? 0) - activePause);
}

export function setRpe(session: WorkoutSession, itemId: string, setId: string | number, rpe: number | null): WorkoutSession {
  if (rpe !== null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) return session;
  return updateSet(session, itemId, setId, (set) => ({ ...set, rpe }));
}

export function swapExercise(session: WorkoutSession, itemId: string, exercise: Exercise, uuid: () => string): WorkoutSession {
  const index = itemIndex(session, itemId);
  if (index < 0) throw new Error('That workout exercise is no longer available.');
  const item = session.items[index];
  if (exercise.category !== item.exercise.category
    || exercise.muscle_groups[0] !== item.exercise.muscle_groups[0]) {
    throw new Error('Choose an exercise with the same category and primary muscle group.');
  }
  const done = item.sets.filter(completed);
  const remaining = item.sets.filter((set) => !completed(set));
  if (!remaining.length) throw new Error('All sets are already complete. Add a new exercise instead of changing logged history.');
  if (!done.length) return {
    ...session, historyPrefillApplied: false,
    items: session.items.map((candidate, i) => i === index ? { ...candidate, exercise } : candidate),
  };
  const id = uuid();
  const replacement: SessionItem = {
    ...item, id, key: id, exercise,
    sets: remaining.map((set, position) => ({ ...set, position })),
    initialSets: remaining.map((set, position) => ({ ...set, position })),
  };
  return {
    ...session, focusIndex: index + 1, historyPrefillApplied: false,
    items: [
      ...session.items.slice(0, index), { ...item, sets: done }, replacement,
      ...session.items.slice(index + 1),
    ],
  };
}
