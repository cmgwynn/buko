import assert from 'node:assert/strict';
import test from 'node:test';
import { repeatPlanRows } from './repeat';
import type { MealPlanEntry } from './types';

test('repeating a plan preserves portions and meals but never log status or IDs', () => {
  const entries: MealPlanEntry[] = [{ id: 'old', user_id: 'owner', planned_on: '2026-12-28', meal: 'dinner', recipe_id: 'recipe', servings: 1.5, logged_at: 'done' }];
  assert.deepEqual(repeatPlanRows(entries, 'owner', 7), [{ user_id: 'owner', planned_on: '2027-01-04', meal: 'dinner', recipe_id: 'recipe', servings: 1.5, logged_at: null }]);
  assert.throws(() => repeatPlanRows(entries, 'owner', 0));
});
