import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signOutWithCleanup, type SafeSignOutDependencies } from './signOut';
import { createAccountStorageWrites } from './storageWrites';

function fixture() {
  let current: string | null = 'alice';
  const guard = createAccountStorageWrites();
  guard.setAccount(current);
  const events: string[] = [];
  const deps: SafeSignOutDependencies = {
    currentUserId: async () => current,
    purge: async (userId) => { await guard.revoke(userId); events.push(`purge:${userId}`); },
    recover: async (userId) => { guard.setAccount(userId); events.push(`recover:${userId}`); },
    signOut: async () => { current = null; events.push('signout'); },
  };
  return { deps, guard, events, switchAccount: (id: string) => { current = id; } };
}

describe('safe local sign-out', () => {
  it('purges work before signing out and leaves no writable account', async () => {
    const f = fixture();
    await signOutWithCleanup(f.deps);
    assert.deepEqual(f.events, ['purge:alice', 'signout', 'recover:null']);
    assert.equal(f.guard.getAccount(), null);
  });

  it('restores device writes for the still-signed-in account when local sign-out fails', async () => {
    const f = fixture();
    f.deps.signOut = async () => { throw new Error('local logout failed'); };
    await assert.rejects(signOutWithCleanup(f.deps), /Sign-out was not completed.*local logout failed/);
    assert.equal(f.guard.getAccount(), 'alice');
    assert.equal(await f.guard.run('alice', async () => {}), true);
  });

  it('restores the guard and surfaces failed cleanup without attempting sign-out', async () => {
    const f = fixture();
    f.deps.purge = async (id) => { await f.guard.revoke(id); throw new Error('device removal failed'); };
    await assert.rejects(signOutWithCleanup(f.deps), /device removal failed/);
    assert.equal(f.guard.getAccount(), 'alice');
    assert.equal(f.events.includes('signout'), false);
  });

  it('does not sign out a new account that appeared while cleanup was running', async () => {
    const f = fixture();
    f.deps.purge = async () => { f.switchAccount('bob'); };
    await assert.rejects(signOutWithCleanup(f.deps), /account changed/);
    assert.equal(f.guard.getAccount(), 'bob');
    assert.equal(f.events.includes('signout'), false);
  });
});
