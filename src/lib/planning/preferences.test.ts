import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeExcludedExercises, normalizeExcludedFoods } from './preferenceValidation';

test('food exclusions are trimmed, case-insensitively deduplicated and bounded', () => {
  assert.deepEqual(normalizeExcludedFoods([' peanuts ', 'Peanuts', '', 'shellfish']), ['peanuts', 'shellfish']);
  assert.throws(() => normalizeExcludedFoods(['x'.repeat(81)]), /80 characters/);
  assert.throws(() => normalizeExcludedFoods(Array.from({ length: 51 }, (_, index) => `food ${index}`)), /50/);
});

test('exercise exclusions require unique UUIDs and enforce a bounded list', () => {
  const exercise = '33333333-3333-4333-8333-333333333333';
  assert.deepEqual(normalizeExcludedExercises([exercise, exercise]), [exercise]);
  assert.throws(() => normalizeExcludedExercises(['not-an-id']), /invalid/);
  assert.throws(() => normalizeExcludedExercises(Array.from({ length: 201 }, () => exercise)), /invalid/);
});
