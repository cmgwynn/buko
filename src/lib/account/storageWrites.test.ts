import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAccountStorageWrites } from './storageWrites';

describe('account-bound local write queue', () => {
  it('drains an in-flight write and rejects queued writes before cleanup', async () => {
    const writes = createAccountStorageWrites();
    writes.setAccount('alice');
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const events: string[] = [];
    const first = writes.run('alice', async () => { await waiting; events.push('first-write'); });
    await Promise.resolve();
    const pending = writes.run('alice', async () => { events.push('stale-write'); });
    const cleanup = writes.revoke('alice').then(() => { events.push('remove-key'); });
    release();
    assert.equal(await first, true);
    assert.equal(await pending, false);
    await cleanup;
    assert.deepEqual(events, ['first-write', 'remove-key']);
    assert.equal(await writes.run('alice', async () => { events.push('late-write'); }), false);
  });

  it('does not revive queued work after signing back into the same account', async () => {
    const writes = createAccountStorageWrites();
    writes.setAccount('alice');
    const stale = writes.run('alice', async () => { assert.fail('Stale write must not run'); });
    writes.setAccount(null);
    writes.setAccount('alice');
    assert.equal(await stale, false);
  });

  it('does not revoke another signed-in account, and continues after a failed write', async () => {
    const writes = createAccountStorageWrites();
    writes.setAccount('bob');
    await writes.revoke('alice');
    await assert.rejects(writes.run('bob', async () => { throw new Error('storage failed'); }), /storage failed/);
    assert.equal(await writes.run('bob', async () => {}), true);
  });
});
