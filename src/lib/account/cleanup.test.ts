import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanupDeletedAccount, type CleanupDependencies } from './cleanup';

describe('deleted-account device cleanup', () => {
  function fixture() {
    let current: string | null = 'alice';
    const events: string[] = [];
    const deps: CleanupDependencies = {
      currentUserId: async () => current,
      removeKeys: async (keys) => { events.push(...keys); },
      signOut: async () => { events.push('signout'); current = null; },
      resetMemory: () => { events.push('reset-draft-and-workout'); },
      authStorageKey: 'sb-project-auth-token',
    };
    return { deps, events, switchUser: (user: string) => { current = user; } };
  }
  it('clears only the owned preference, auth session, draft and workout', async () => {
    const f = fixture();
    await cleanupDeletedAccount('alice', f.deps);
    assert.deepEqual(f.events, [
      'buko:diagnostics:alice', 'buko:recovery:recipe:alice', 'buko:recovery:workout:alice',
      'buko:recipe-favorites:alice', 'buko:recently-cooked:alice', 'buko:grocery-offline:alice', 'buko:onboarding:alice', 'reset-draft-and-workout', 'signout',
      'sb-project-auth-token', 'sb-project-auth-token-code-verifier', 'sb-project-auth-token-user',
    ]);
  });
  it('preserves another signed-in user and their in-memory data', async () => {
    const f = fixture();
    f.switchUser('bob');
    await cleanupDeletedAccount('alice', f.deps);
    assert.deepEqual(f.events, ['buko:diagnostics:alice', 'buko:recovery:recipe:alice', 'buko:recovery:workout:alice', 'buko:recipe-favorites:alice', 'buko:recently-cooked:alice', 'buko:grocery-offline:alice', 'buko:onboarding:alice']);
  });
  it('does not erase a new session created while signout completes', async () => {
    const f = fixture();
    f.deps.signOut = async () => { f.switchUser('bob'); };
    await cleanupDeletedAccount('alice', f.deps);
    assert.deepEqual(f.events, ['buko:diagnostics:alice', 'buko:recovery:recipe:alice', 'buko:recovery:workout:alice', 'buko:recipe-favorites:alice', 'buko:recently-cooked:alice', 'buko:grocery-offline:alice', 'buko:onboarding:alice', 'reset-draft-and-workout']);
  });
  it('still removes the dead session when signout fails and makes the partial cleanup explicit', async () => {
    const f = fixture();
    f.deps.signOut = async () => { throw new Error('logout offline'); };
    await assert.rejects(cleanupDeletedAccount('alice', f.deps), /server account was deleted.*local sign-out/);
    assert.ok(f.events.includes('sb-project-auth-token'));
  });
  it('attempts session cleanup even if scoped-preference removal fails', async () => {
    const f = fixture();
    f.deps.removeKeys = async (keys) => {
      if (keys[0].startsWith('buko:')) throw new Error('device storage unavailable');
      f.events.push(...keys);
    };
    await assert.rejects(cleanupDeletedAccount('alice', f.deps), /device preferences/);
    assert.ok(f.events.includes('signout'));
    assert.ok(f.events.includes('sb-project-auth-token'));
  });
});
