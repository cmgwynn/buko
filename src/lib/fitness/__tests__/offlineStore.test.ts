import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFitnessOfflineStore, fitnessOfflineKey } from '../offlineStore';

function fixture() {
  const values = new Map<string, string>();
  let failRead = false;
  let failWrite = false;
  let rpcError: string | null = null;
  let account = 'alice';
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const storage = {
    async getItem(key: string) { if (failRead) throw new Error('read full'); return values.get(key) ?? null; },
    async setItem(key: string, value: string) { if (failWrite) throw new Error('disk full'); values.set(key, value); },
    async removeItem(key: string) { values.delete(key); },
  };
  const store = createFitnessOfflineStore({
    storage, account: () => account,
    async rpc(name, args) {
      calls.push({ name, args });
      return { error: rpcError ? { message: rpcError } : null };
    },
  });
  return {
    store, storage, values, calls,
    failRead: (value: boolean) => { failRead = value; },
    failWrite: (value: boolean) => { failWrite = value; },
    rpcError: (value: string | null) => { rpcError = value; },
    account: (value: string) => { account = value; },
  };
}
const payload = (id = 'workout') => ({
  id, name: 'Lift', started_at: '2026-01-01T10:00:00Z',
  items: [{ exercise_id: 'squat', sets: [{ reps: 8, weight_kg: 20, is_warmup: false }] }],
});

describe('durable account-scoped workout cache and outbox', () => {
  it('survives restarts and has no 24-hour expiry, with independent account namespaces', async () => {
    const f = fixture();
    await f.store.queueCompletedWorkout('alice', 'workout', payload());
    await f.store.cacheWorkoutHistory('alice', 'example', { value: 'cached' });
    const reopened = createFitnessOfflineStore({ storage: f.storage, rpc: async () => ({ error: null }) });
    assert.equal(await reopened.pendingWorkoutCount('alice'), 1);
    assert.equal(await reopened.pendingWorkoutCount('bob'), 0);
    assert.deepEqual(await reopened.cachedWorkoutHistory('alice', 'example'), { value: 'cached' });
    assert.equal((await reopened.getFitnessOfflineSnapshot('alice')).history['exercise:squat'] !== undefined, true);
    assert.equal((await reopened.getFitnessOfflineSnapshot('alice')).outbox[0].payload.started_at, '2026-01-01T10:00:00Z');
  });
  it('serializes concurrent cache writes with queue changes instead of losing completed workouts', async () => {
    const { store } = fixture();
    await Promise.all([
      store.queueCompletedWorkout('alice', 'one', payload('one')),
      store.cacheWorkoutCatalog('alice', []),
      store.cacheWorkoutHistory('alice', 'newest', { one: true }),
      store.queueCompletedWorkout('alice', 'two', payload('two')),
    ]);
    const snapshot = await store.getFitnessOfflineSnapshot('alice');
    assert.equal(snapshot.outbox.length, 2);
    assert.deepEqual(snapshot.history.newest, { one: true });
    assert.equal(snapshot.catalogCached, true);
  });
  it('keeps failed submissions and emits an explicit retryable result, then replays each stable identity once', async () => {
    const f = fixture();
    await f.store.queueCompletedWorkout('alice', 'workout', payload());
    f.rpcError('offline');
    const failed = await f.store.syncPendingWorkouts('alice');
    assert.equal(failed.pending, 1);
    assert.match(failed.error!, /offline/);
    assert.equal((await f.store.getFinishedWorkout('alice', 'workout'))?.syncStatus, 'error');
    f.rpcError(null);
    assert.deepEqual(await f.store.syncPendingWorkouts('alice'), { pending: 0 });
    assert.equal((await f.store.getFinishedWorkout('alice', 'workout'))?.syncStatus, 'synced');
    await f.store.queueCompletedWorkout('alice', 'workout', payload());
    assert.equal(await f.store.pendingWorkoutCount('alice'), 0);
    assert.equal(f.calls.length, 2);
  });
  it('does not claim completion when storage fails and does not delete corrupt or unsynced data', async () => {
    const f = fixture();
    f.failWrite(true);
    await assert.rejects(f.store.queueCompletedWorkout('alice', 'workout', payload()), /could not be saved/);
    f.failWrite(false);
    await f.store.queueCompletedWorkout('alice', 'workout', payload());
    await assert.rejects(f.store.purgeFitnessOfflineData('alice'), /preserved/);
    assert.equal(await f.store.pendingWorkoutCount('alice'), 1);
    f.values.set(fitnessOfflineKey('alice'), '{broken');
    await assert.rejects(f.store.pendingWorkoutCount('alice'), /could not be read/);
    assert.equal(f.values.get(fitnessOfflineKey('alice')), '{broken');
  });
  it('blocks cross-account mutation/replay and preserves preferences until they sync or are explicitly discarded', async () => {
    const f = fixture();
    await f.store.cacheExerciseRestSeconds('alice', 'squat', 120);
    assert.equal(await f.store.pendingWorkoutCount('alice'), 1);
    await assert.rejects(f.store.purgeFitnessOfflineData('alice'), /preserved/);
    f.account('bob');
    await assert.rejects(f.store.queueCompletedWorkout('alice', 'workout', payload()), /account changed/);
    await assert.rejects(f.store.syncPendingWorkouts('alice'), /account changed/);
    f.account('alice');
    await f.store.syncPendingWorkouts('alice');
    assert.equal(f.calls[0].name, 'save_exercise_rest_preference');
    assert.equal(await f.store.cachedExerciseRestSeconds('alice', 'squat'), 120);
    await f.store.purgeFitnessOfflineData('alice');
    await assert.rejects(f.store.cacheWorkoutHistory('alice', 'late', {}), /being cleared/);
    assert.equal(f.values.has(fitnessOfflineKey('alice')), false);
    f.store.activateFitnessOfflineAccount('alice');
    await f.store.cacheWorkoutHistory('alice', 'new-login', { okay: true });
    assert.deepEqual(await f.store.cachedWorkoutHistory('alice', 'new-login'), { okay: true });
  });
  it('preserves newly finished local history when a stale server refresh completes afterwards', async () => {
    const { store } = fixture();
    await store.queueCompletedWorkout('alice', 'workout', payload());
    await store.cacheWorkoutHistory('alice', 'exercise:squat', { sessions: [], dated: [] });
    const history = await store.cachedWorkoutHistory<{ sessions: { workoutId: string }[] }>('alice', 'exercise:squat');
    assert.equal(history?.sessions[0].workoutId, 'workout');
    await store.removeCachedWorkout('alice', 'workout');
    const removed = await store.cachedWorkoutHistory<{ sessions: unknown[] }>('alice', 'exercise:squat');
    assert.deepEqual(removed?.sessions, []);
  });
});
