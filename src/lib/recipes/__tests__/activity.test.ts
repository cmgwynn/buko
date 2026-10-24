import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountStorageWrites } from '../../account/storageWrites';
import { createRecipeActivityStore, recipeFavoritesKey, recentlyCookedKey } from '../activity';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  };
}

test('recipe favorites are account-scoped, idempotent and errors are surfaced', async () => {
  const storage = memoryStorage();
  const activity = createRecipeActivityStore(storage);

  assert.deepEqual(await activity.setFavorite('alice', 'recipe-a', true), ['recipe-a']);
  assert.deepEqual(await activity.setFavorite('alice', 'recipe-a', true), ['recipe-a']);
  assert.deepEqual(await activity.setFavorite('alice', 'recipe-b', true), ['recipe-a', 'recipe-b']);
  assert.deepEqual(await activity.getFavorites('bob'), []);
  assert.deepEqual(await activity.setFavorite('alice', 'recipe-a', false), ['recipe-b']);
  assert.equal(storage.values.has(recipeFavoritesKey('alice')), true);
  assert.equal(await activity.getFavorites('alice').then((v) => v.includes('recipe-a')), false);

  await assert.rejects(activity.getFavorites(''), /signed-in account/);
  await assert.rejects(activity.setFavorite('alice', '', true), /recipe is required/);
});

test('recently cooked recipes are newest first, deduplicated and bounded', async () => {
  const storage = memoryStorage();
  const activity = createRecipeActivityStore(storage);

  assert.deepEqual(await activity.recordCooked('alice', 'recipe-a', '2026-01-01T12:00:00Z'), [
    { recipeId: 'recipe-a', cookedAt: '2026-01-01T12:00:00Z' },
  ]);
  await activity.recordCooked('alice', 'recipe-b', '2026-01-02T12:00:00Z');
  const updated = await activity.recordCooked('alice', 'recipe-a', '2026-01-03T12:00:00Z');
  assert.deepEqual(updated.map((item) => item.recipeId), ['recipe-a', 'recipe-b']);
  assert.equal(updated[0].cookedAt, '2026-01-03T12:00:00Z');
  assert.equal(await activity.getRecentlyCooked('bob').then((v) => v.length), 0);
  assert.equal(storage.values.has(recentlyCookedKey('alice')), true);

  for (let index = 0; index < 40; index++) {
    await activity.recordCooked('alice', `recipe-${index}`, new Date(2026, 0, index + 1).toISOString());
  }
  assert.equal((await activity.getRecentlyCooked('alice')).length, 30);
  await assert.rejects(activity.recordCooked('alice', 'recipe-c', 'invalid'), /valid cooking date/);
});

test('malformed persisted activity fails visibly instead of being overwritten', async () => {
  const storage = memoryStorage();
  const activity = createRecipeActivityStore(storage);
  storage.values.set(recipeFavoritesKey('alice'), '{');
  await assert.rejects(activity.getFavorites('alice'), /could not be read/);
  storage.values.set(recentlyCookedKey('alice'), JSON.stringify([{ recipeId: 'recipe-a', cookedAt: 'bad' }]));
  await assert.rejects(activity.getRecentlyCooked('alice'), /unexpected format/);
});

test('activity writes are skipped after the account is revoked', async () => {
  const storage = memoryStorage();
  const writes = createAccountStorageWrites();
  const activity = createRecipeActivityStore(storage, writes.run);
  writes.setAccount('alice');
  assert.deepEqual(await activity.setFavorite('alice', 'recipe-a', true), ['recipe-a']);
  await assert.rejects(activity.setFavorite('bob', 'recipe-b', true), /not saved/);
  const pending = activity.recordCooked('alice', 'recipe-a', '2026-01-01T12:00:00Z');
  await writes.revoke('alice');
  await assert.rejects(pending, /not saved/);
  assert.deepEqual(JSON.parse(storage.values.get(recentlyCookedKey('alice')) ?? '[]'), []);
  storage.values.clear();
  await assert.rejects(activity.recordCooked('alice', 'recipe-c', '2026-01-02T12:00:00Z'), /not saved/);
  assert.equal(storage.values.size, 0);
});
