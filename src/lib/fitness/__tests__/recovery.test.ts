import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WORKOUT_SESSION_TTL } from '../../localRecovery';
import { isRecoverableWorkout } from '../recovery';
import type { WorkoutSession } from '../session';

describe('active-workout recovery policy', () => {
  const workout: WorkoutSession = {
    active: true, name: 'Workout', startedAt: 1000, routineId: null,
    items: [{
      key: 'one', exercise: { id: 'squat', name: 'Squat', user_id: null, category: 'strength', muscle_groups: ['quads'], equipment: null, met: 5 },
      sets: [{ position: 0, reps: 5, weight_kg: 20, duration_s: null, distance_m: null, is_warmup: false }],
    }],
  };
  it('recovers valid unfinished exercises and set values', () => {
    assert.equal(isRecoverableWorkout(workout, 2000), true);
  });
  it('expires by workout start time even if recent edits refreshed the storage timestamp', () => {
    assert.equal(isRecoverableWorkout(workout, 1000 + WORKOUT_SESSION_TTL - 1), true);
    assert.equal(isRecoverableWorkout(workout, 1000 + WORKOUT_SESSION_TTL), false);
  });
  it('never restores ended, future-dated, malformed or non-finite workout snapshots', () => {
    assert.equal(isRecoverableWorkout({ ...workout, active: false }, 2000), false);
    assert.equal(isRecoverableWorkout({ ...workout, startedAt: 3000 }, 2000), false);
    assert.equal(isRecoverableWorkout({ ...workout, items: [{ key: 'bad' }] }, 2000), false);
    assert.equal(isRecoverableWorkout({ ...workout, items: [{ ...workout.items[0], sets: [{ ...workout.items[0].sets[0], weight_kg: Infinity }] }] }, 2000), false);
  });
});
