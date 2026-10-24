import assert from 'node:assert/strict';
import test from 'node:test';
import { HISTORY_PAGE_SIZE, loadHistoryPages } from './historyPages';

test('history pagination reads beyond 1000 records and keeps the final page', async () => {
  const all = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const calls: number[][] = [];
  const rows = await loadHistoryPages(async (from, to) => {
    calls.push([from, to]);
    return { data: all.slice(from, to + 1), error: null };
  }, () => true);
  assert.deepEqual(rows, all);
  assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
});

test('history pagination rejects incomplete pages and stops stale requests', async () => {
  await assert.rejects(loadHistoryPages(async () => ({ data: null, error: { message: 'offline' } }), () => true), /offline/);
  let current = true;
  let calls = 0;
  const result = await loadHistoryPages(async () => {
    calls += 1;
    current = false;
    return { data: Array(HISTORY_PAGE_SIZE).fill('old account'), error: null };
  }, () => current);
  assert.equal(result, null);
  assert.equal(calls, 1);
});
