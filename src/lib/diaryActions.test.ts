import assert from 'node:assert/strict';
import { test } from 'node:test';
import { favoriteFood, planDayCopy } from './diaryActions';
import type { FoodLogEntry } from '../types';

const entry: FoodLogEntry = {
  id: 'original', user_id: 'owner', logged_on: '2026-01-02', meal: 'breakfast',
  source: 'manual', source_id: null, name: 'Oats', brand: null, quantity: 2, unit: 'serving',
  grams: 80, calories: 300, protein_g: 10, carbs_g: 50, fat_g: 6, created_at: '2026-01-02T08:00:00Z',
};
test('a food favorite rebuilds the saved serving without changing its macros', () => {
  const result = favoriteFood({ id: 'favorite', user_id: 'owner', food_key: 'manual:Oats', snapshot: entry });
  assert.ok(result);
  assert.equal(result.food.servingG, 40);
  assert.deepEqual(result.last, { quantity: 2, unit: 'serving' });
  assert.equal(result.food.per100g.calories, 375);
  assert.equal(result.lastGrams, 80);
  assert.equal(result.key, 'manual:Oats');
});
test('day-copy previews match only within a meal and preserve repeated portions', () => {
  const second = { ...entry, id: 'second' };
  const dinner = { ...entry, id: 'dinner', meal: 'dinner' as const };
  const alreadyThere = { ...entry, id: 'destination', logged_on: '2026-01-03', grams: 80.01 };
  const result = planDayCopy([entry, second, dinner], [alreadyThere]);
  assert.deepEqual(result.toAdd.map((row) => row.id), ['second', 'dinner']);
  assert.deepEqual(result.duplicates.map((row) => row.id), ['original']);
});
test('favorite reconstruction rejects invalid weights', () => {
  assert.equal(favoriteFood({ id: 'favorite', user_id: 'owner', food_key: 'manual:Oats', snapshot: { ...entry, grams: 0 } }), null);
});
