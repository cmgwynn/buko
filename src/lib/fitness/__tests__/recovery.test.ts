import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRecoveryStore, recoveryKey, WORKOUT_SESSION_TTL } from '../../localRecovery';
import { isRecoverableWorkout, migrateWorkoutSession } from '../recovery';
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
  it('keeps unfinished workouts beyond 24 hours instead of silently expiring them', () => {
    assert.equal(isRecoverableWorkout(workout, 1000 + WORKOUT_SESSION_TTL - 1), true);
    assert.equal(isRecoverableWorkout(workout, 1000 + WORKOUT_SESSION_TTL), true);
    assert.equal(isRecoverableWorkout(workout, 1000 + 365 * WORKOUT_SESSION_TTL), true);
  });
  it('never restores ended, future-dated, malformed or non-finite workout snapshots', () => {
    assert.equal(isRecoverableWorkout({ ...workout, active: false }, 2000), false);
    assert.equal(isRecoverableWorkout({ ...workout, startedAt: 3000 }, 2000), false);
    assert.equal(isRecoverableWorkout({ ...workout, items: [{ key: 'bad' }] }, 2000), false);
    assert.equal(isRecoverableWorkout({ ...workout, items: [{ ...workout.items[0], sets: [{ ...workout.items[0].sets[0], weight_kg: Infinity }] }] }, 2000), false);
  });
  it('migrates legacy recovery identities once without claiming planned legacy sets were completed', () => {
    let counter = 0;
    const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
    const migrated = migrateWorkoutSession(workout, uuid);
    assert.equal(migrated.sessionId, '00000000-0000-4000-8000-000000000001');
    assert.equal(migrated.items[0].key, migrated.items[0].id);
    assert.equal(migrated.items[0].sets[0].completed, false);
    assert.equal(migrated.items[0].sets[0].completed_at, null);
    assert.deepEqual(migrateWorkoutSession(migrated, uuid), migrated);
    assert.equal(counter, 3);
  });
  it('keeps a workout through auth loss/account switching without exposing it to another account, until explicit purge', async () => {
    const saved = new Map<string, string>();
    const store = createRecoveryStore<WorkoutSession>({
      kind: 'workout', ttl: Infinity, keepPreviousAccount: true,
      now: () => 2000,
      storage: {
        async getItem(key) { return saved.get(key) ?? null; },
        async setItem(key, value) { saved.set(key, value); },
        async removeItem(key) { saved.delete(key); },
      },
      empty: () => ({ active: false, name: '', startedAt: 0, routineId: null, items: [] }),
      isEmpty: (session) => !session.active,
      validate: (value): value is WorkoutSession => isRecoverableWorkout(value, 2000),
    });
    await store.setAccount('alice');
    store.set(workout);
    await store.retry();
    await store.setAccount(null);
    assert.equal(store.get().active, false);
    assert.ok(saved.has(recoveryKey('workout', 'alice')));
    await store.setAccount('bob');
    assert.equal(store.get().active, false);
    await store.setAccount('alice');
    assert.deepEqual(store.get(), workout);
    await store.purge('alice');
    assert.equal(saved.has(recoveryKey('workout', 'alice')), false);
  });
  it('reports failed durable writes through retry rejection rather than permitting navigation to assume a save', async () => {
    const store = createRecoveryStore<WorkoutSession>({
      kind: 'workout', ttl: Infinity, keepPreviousAccount: true,
      now: () => 2000,
      storage: {
        async getItem() { return null; },
        async setItem() { throw new Error('disk full'); },
        async removeItem() {},
      },
      empty: () => ({ active: false, name: '', startedAt: 0, routineId: null, items: [] }),
      isEmpty: (session) => !session.active,
      validate: (value): value is WorkoutSession => isRecoverableWorkout(value, 2000),
    });
    await store.setAccount('alice');
    store.set(workout);
    await assert.rejects(store.retry(), /disk full/);
    assert.equal(store.getRecovery().status, 'error');
    assert.match(store.getRecovery().error!, /could not be updated/);
    assert.equal(store.get().active, true);
  });
});
