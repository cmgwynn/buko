import type { WorkoutSession } from './session';
import type { WorkoutSet } from './types';

export interface CachedExerciseHistory {
  sessions: { workoutId: string; date: string; sets: WorkoutSet[] }[];
}

/** Compare captured identities/values so late cache reads never overwrite edits or a swapped exercise. */
export function applyHistoryPrefill(
  current: WorkoutSession,
  captured: WorkoutSession,
  history: Record<string, CachedExerciseHistory>,
): WorkoutSession {
  if (current.sessionId !== captured.sessionId || current.historyPrefillApplied) return current;
  return {
    ...current,
    historyPrefillApplied: true,
    items: current.items.map((item) => {
      const original = captured.items.find((candidate) => candidate.key === item.key && candidate.exercise.id === item.exercise.id);
      const latest = history[item.exercise.id]?.sessions
        .filter((session) => session.workoutId !== current.sessionId)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!original || !latest) return item;
      const previous = latest.sets.filter((set) => !set.is_warmup);
      return {
        ...item,
        sets: item.sets.map((set, index) => {
          if (set.completed || set.completed_at || set.is_warmup) return set;
          const initial = item.initialSets?.find((candidate) => candidate.id === set.id);
          const beforeRead = original.sets.find((candidate) => candidate.id === set.id);
          const workingIndex = item.sets.slice(0, index).filter((candidate) => !candidate.is_warmup).length;
          const prior = previous[workingIndex] ?? previous.at(-1);
          if (!initial || !beforeRead || !prior) return set;
          const result = { ...set };
          for (const field of ['reps', 'weight_kg', 'duration_s', 'distance_m'] as const) {
            if (!set.prefillEditedFields?.includes(field) && set[field] === initial[field]
              && set[field] === beforeRead[field] && prior[field] != null) result[field] = prior[field];
          }
          return result;
        }),
      };
    }),
  };
}
