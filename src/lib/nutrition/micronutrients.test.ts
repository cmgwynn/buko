import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FoodLogEntry, Nutrients } from '../../types';
import { micronutrientsForGrams, per100gMicronutrients, sumMicronutrients } from './micronutrients';

const nutrients: Nutrients = {
  calories: 100, protein: 5, carbs: 10, fat: 2, sugars: null, saturatedFat: null, sodiumMg: null, fiber: null,
  calciumMg: 100, ironMg: 2, potassiumMg: 250, vitaminCMg: 4, vitaminDMcg: 1,
};
const entry = (micronutrients: FoodLogEntry['micronutrients']): Pick<FoodLogEntry, 'micronutrients'> => ({ micronutrients });

test('scales reported micronutrients for the logged amount and rebuilds per-100g snapshots', () => {
  const amounts = micronutrientsForGrams(nutrients, 150);
  assert.deepEqual(amounts, { calciumMg: 150, ironMg: 3, potassiumMg: 375, vitaminCMg: 6, vitaminDMcg: 1.5 });
  assert.deepEqual(per100gMicronutrients(amounts, 150), {
    calciumMg: 100, ironMg: 2, potassiumMg: 250, vitaminCMg: 4, vitaminDMcg: 1,
  });
});

test('unknown, invalid, and missing values stay unknown instead of becoming zero', () => {
  const amounts = micronutrientsForGrams({ ...nutrients, calciumMg: null, ironMg: -1 }, 100);
  assert.equal(amounts.calciumMg, null);
  assert.equal(amounts.ironMg, null);
  assert.deepEqual(sumMicronutrients([entry(null)]).vitaminDMcg, { amount: 0, knownEntries: 0, missingEntries: 1 });
});

test('daily aggregation retains known subtotal and reports entries missing a source value', () => {
  const totals = sumMicronutrients([
    entry({ calciumMg: 10, ironMg: null, potassiumMg: 0, vitaminCMg: 5, vitaminDMcg: null }),
    entry({ calciumMg: null, ironMg: 2, potassiumMg: 20, vitaminCMg: null, vitaminDMcg: 1 }),
  ]);
  assert.deepEqual(totals.calciumMg, { amount: 10, knownEntries: 1, missingEntries: 1 });
  assert.deepEqual(totals.ironMg, { amount: 2, knownEntries: 1, missingEntries: 1 });
  assert.deepEqual(totals.potassiumMg, { amount: 20, knownEntries: 2, missingEntries: 0 });
});
