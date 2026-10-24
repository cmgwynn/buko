import { newRecordsFor, personalRecords, estimateOneRepMax, type DatedSet } from './calc';
import { isSetCompleted, workoutDurationMs } from './engine';
import type { WorkoutSession } from './session';
import type { WorkoutRecord, WorkoutSummary } from './offlineStore';

export function summarizeSession(
  session: WorkoutSession,
  history: Record<string, DatedSet[]> = {},
  now = Date.now(),
): WorkoutSummary {
  const records: WorkoutRecord[] = [];
  let volumeKg = 0;
  let completedSets = 0;
  for (const item of session.items) {
    const previous = history[item.exercise.id] ?? [];
    const prior = personalRecords(previous);
    const best = new Map<WorkoutRecord['kind'], WorkoutRecord>();
    for (const set of item.sets.filter(isSetCompleted)) {
      completedSets++;
      if (!set.is_warmup) volumeKg += (set.reps ?? 0) * (set.weight_kg ?? 0);
      for (const kind of newRecordsFor(previous, set)) {
        const value = kind === 'heaviest' ? set.weight_kg!
          : kind === 'oneRepMax' ? estimateOneRepMax(set.weight_kg!, set.reps!)
            : set.weight_kg! * set.reps!;
        const previousValue = kind === 'heaviest' ? prior.heaviest!.weight_kg
          : kind === 'oneRepMax' ? prior.bestOneRepMax!.value : prior.bestSetVolume!.value;
        if (!best.has(kind) || value > best.get(kind)!.value) {
          best.set(kind, { exerciseId: item.exercise.id, exerciseName: item.exercise.name, kind, value, previousValue });
        }
      }
    }
    records.push(...best.values());
  }
  return {
    durationSec: Math.max(0, Math.floor(workoutDurationMs(session, now) / 1000)),
    volumeKg, completedSets, records,
  };
}
