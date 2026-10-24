import assert from 'node:assert/strict';
import test from 'node:test';
import { groceryCacheKey, queueGroceryCheck, readGroceryCache, writeGroceryCache, type GroceryCache } from './offlineGroceries';
import type { GroceryItem } from '../../types';

const item: GroceryItem = { id: 'a', user_id: 'owner', name: 'Apple', barcode: null, source: 'manual', source_id: null, quantity: null, section: 'produce', generated_week: null, from_recipes: [], checked: false, checked_at: null, created_at: '' };
test('offline checks coalesce to the latest intention and preserve the list', () => {
  const initial: GroceryCache = { version: 1, savedAt: 1, items: [item], pending: [] };
  const result = queueGroceryCheck(queueGroceryCheck(initial, 'a', true, 1000), 'a', false, 2000);
  assert.equal(result.pending.length, 1);
  assert.equal(result.items[0].checked, false);
  assert.equal(result.pending[0].checked, false);
  assert.equal(initial.items[0].checked, false);
  assert.throws(() => queueGroceryCheck(initial, 'missing', true));
});
test('cache is account scoped, expires, and never accepts another owner', async () => {
  const data = new Map<string, string>();
  const storage = { getItem: async (key: string) => data.get(key) ?? null, setItem: async (key: string, text: string) => { data.set(key, text); }, removeItem: async (key: string) => { data.delete(key); } };
  const cache: GroceryCache = { version: 1, savedAt: 1000, items: [item], pending: [] };
  await writeGroceryCache(storage, 'owner', cache);
  assert.equal(await readGroceryCache(storage, 'other', 1000), null);
  await assert.rejects(writeGroceryCache(storage, 'other', cache));
  assert.equal((await readGroceryCache(storage, 'owner', 2000))?.items[0].name, 'Apple');
  assert.equal(await readGroceryCache(storage, 'owner', 8 * 86400000), null);
  assert.equal(data.has(groceryCacheKey('owner')), false);
  await writeGroceryCache(storage, 'owner', queueGroceryCheck(cache, 'a', true, 1000));
  await assert.rejects(readGroceryCache(storage, 'owner', 8 * 86400000), /not synced/);
});
