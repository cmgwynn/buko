import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRecoveryStore, recoveryKey, RECIPE_DRAFT_TTL, WORKOUT_SESSION_TTL, type RecoveryStorage } from './localRecovery';

function fixture(ttl = RECIPE_DRAFT_TTL) {
  const records = new Map<string, string>();
  let time = 1_000_000;
  let readFailure = false;
  let writeFailure = false;
  const storage: RecoveryStorage = {
    getItem: async (key) => { if (readFailure) throw new Error('read failed'); return records.get(key) ?? null; },
    setItem: async (key, value) => { if (writeFailure) throw new Error('write failed'); records.set(key, value); },
    removeItem: async (key) => { records.delete(key); },
  };
  const create = () => createRecoveryStore({
    kind: 'test', ttl, storage, now: () => time,
    empty: () => ({ text: '' }), isEmpty: (value) => value.text === '',
    validate: (value): value is { text: string } => !!value && typeof (value as { text?: unknown }).text === 'string',
  });
  return {
    records, storage, create, advance: (ms: number) => { time += ms; },
    readFailure: (failed: boolean) => { readFailure = failed; },
    writeFailure: (failed: boolean) => { writeFailure = failed; },
  };
}

describe('account-scoped device recovery', () => {
  it('blocks mutations before hydration and recovers a saved snapshot on restart', async () => {
    const f = fixture();
    const first = f.create();
    const hydration = first.setAccount('alice');
    assert.throws(() => first.set({ text: 'too early' }), /before editing/);
    await hydration;
    first.set({ text: 'recipe or workout' });
    await first.retry();
    assert.equal(first.getRecovery().status, 'saved');
    const restarted = f.create();
    await restarted.setAccount('alice');
    assert.deepEqual(restarted.get(), { text: 'recipe or workout' });
    assert.equal(restarted.getRecovery().status, 'recovered');
  });

  for (const ttl of [RECIPE_DRAFT_TTL, WORKOUT_SESSION_TTL]) {
    it(`removes expired work at its ${ttl}ms boundary`, async () => {
      const f = fixture(ttl);
      const first = f.create();
      await first.setAccount('alice');
      first.set({ text: 'old work' });
      await first.retry();
      f.advance(ttl);
      const restarted = f.create();
      await restarted.setAccount('alice');
      assert.equal(restarted.get().text, '');
      assert.equal(restarted.getRecovery().status, 'expired');
      assert.equal(f.records.has(recoveryKey('test', 'alice')), false);
    });
  }

  it('clears memory immediately on account switch and purges the old account after queued saves', async () => {
    const f = fixture();
    const store = f.create();
    await store.setAccount('alice');
    store.set({ text: 'private Alice work' });
    const switching = store.setAccount('bob');
    assert.equal(store.get().text, '');
    await switching;
    assert.equal(store.get().text, '');
    assert.equal(f.records.has(recoveryKey('test', 'alice')), false);
    store.set({ text: 'private Bob work' });
    await store.retry();
    await store.setAccount('alice');
    assert.equal(store.get().text, '');
    assert.equal(f.records.has(recoveryKey('test', 'bob')), false);
  });

  it('does not restore another account’s envelope even when placed under this account’s key', async () => {
    const f = fixture();
    f.records.set(recoveryKey('test', 'bob'), JSON.stringify({ version: 1, userId: 'alice', savedAt: 1_000_000, value: { text: 'Alice' } }));
    const store = f.create();
    await store.setAccount('bob');
    assert.equal(store.get().text, '');
    assert.equal(f.records.size, 0);
  });

  it('logout purges persisted work, and a subsequent sign-in cannot restore it', async () => {
    const f = fixture();
    const store = f.create();
    await store.setAccount('alice');
    store.set({ text: 'private work' });
    await store.retry();
    await store.setAccount(null);
    assert.equal(store.get().text, '');
    assert.equal(f.records.size, 0);
    await store.setAccount('alice');
    assert.equal(store.get().text, '');
  });

  it('tombstones before remote completion, so a crash never revives completed work', async () => {
    const f = fixture();
    const store = f.create();
    await store.setAccount('alice');
    store.set({ text: 'finishing' });
    await store.prepareToComplete();
    assert.equal(store.get().text, 'finishing');
    const restarted = f.create();
    await restarted.setAccount('alice');
    assert.equal(restarted.get().text, '');
  });

  it('resumes recovery after a failed remote save and can subsequently discard it', async () => {
    const f = fixture();
    const store = f.create();
    await store.setAccount('alice');
    store.set({ text: 'unsaved' });
    await store.prepareToComplete();
    await store.retry();
    const restarted = f.create();
    await restarted.setAccount('alice');
    assert.equal(restarted.get().text, 'unsaved');
    await store.clear();
    const afterDiscard = f.create();
    await afterDiscard.setAccount('alice');
    assert.equal(afterDiscard.get().text, '');
  });

  it('keeps hydration failures explicit, blocks edits, and supports a read retry without deleting the draft', async () => {
    const f = fixture();
    const first = f.create();
    await first.setAccount('alice');
    first.set({ text: 'keep me' });
    await first.retry();
    f.readFailure(true);
    const restarted = f.create();
    await restarted.setAccount('alice');
    assert.equal(restarted.getRecovery().ready, false);
    assert.equal(restarted.getRecovery().status, 'error');
    assert.throws(() => restarted.set({ text: 'overwrite' }), /before editing/);
    f.readFailure(false);
    await restarted.retry();
    assert.equal(restarted.get().text, 'keep me');
  });

  it('reports write failures and prevents remote-completion preparation until storage works', async () => {
    const f = fixture();
    const store = f.create();
    await store.setAccount('alice');
    f.writeFailure(true);
    store.set({ text: 'still in memory' });
    await assert.rejects(store.prepareToComplete(), /write failed/);
    assert.equal(store.getRecovery().status, 'error');
    assert.equal(store.get().text, 'still in memory');
    f.writeFailure(false);
    await store.retry();
    assert.equal(store.getRecovery().status, 'saved');
  });

  it('ignores stale hydration during rapid account changes', async () => {
    const f = fixture();
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const store = createRecoveryStore({
      kind: 'test', ttl: 1000, empty: () => ({ text: '' }), isEmpty: (value) => !value.text,
      validate: (value): value is { text: string } => !!value && typeof (value as { text?: unknown }).text === 'string',
      storage: { ...f.storage, getItem: async (key) => { await wait; return f.storage.getItem(key); } },
    });
    const alice = store.setAccount('alice');
    await Promise.resolve();
    const bob = store.setAccount('bob');
    release!();
    await Promise.all([alice, bob]);
    assert.equal(store.getAccount(), 'bob');
    assert.equal(store.get().text, '');
    assert.equal(store.getRecovery().ready, true);
  });
});
