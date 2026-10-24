import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireSyncedWorkouts } from './offlineWork';

describe('account deletion offline workout prerequisite', () => {
  it('checks only the deleting user and permits an empty outbox', async () => {
    const users: string[] = [];
    await requireSyncedWorkouts('alice', async (userId) => { users.push(userId); return 0; });
    assert.deepEqual(users, ['alice']);
  });
  it('blocks queued workouts without silently discarding any payload', async () => {
    const outbox = [{ id: 'complete-workout', payload: { sets: [1, 2] } }];
    await assert.rejects(requireSyncedWorkouts('alice', async () => outbox.length), /1 queued workout or fitness preference change.*No account deletion was requested/);
    assert.deepEqual(outbox, [{ id: 'complete-workout', payload: { sets: [1, 2] } }]);
  });
  it('fails closed for unreadable or invalid offline status', async () => {
    await assert.rejects(requireSyncedWorkouts('alice', async () => { throw new Error('storage unavailable'); }), /storage unavailable/);
    for (const count of [-1, NaN, 0.5]) {
      await assert.rejects(requireSyncedWorkouts('alice', async () => count), /No account deletion was requested/);
    }
  });
  it('blocks an owned active workout before checking the outbox or requesting deletion', async () => {
    let checked = false;
    await assert.rejects(requireSyncedWorkouts('alice', async () => { checked = true; return 0; },
      () => ({ ownerId: 'alice', active: true })), /Finish or explicitly discard.*No account deletion was requested/);
    assert.equal(checked, false);
  });
  it('rechecks active state after awaiting offline storage', async () => {
    let active = false;
    await assert.rejects(requireSyncedWorkouts('alice', async () => { active = true; return 0; },
      () => ({ ownerId: 'alice', active })), /active workout/);
  });
  it('does not block or discard another account’s workout', async () => {
    await requireSyncedWorkouts('alice', async () => 0, () => ({ ownerId: 'bob', active: true }));
  });
});
