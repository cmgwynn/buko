import { describe, expect, test } from '@jest/globals';
import type { Nutrients } from '../../types/index.ts';
import { computeRecipeNutrition } from './nutrition';

const nutrients: Nutrients = {
  calories: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  sugars: 4,
  saturatedFat: 1,
  sodiumMg: 100,
  fiber: 3,
};

describe('recipe nutrition', () => {
  test('scales totals into per-serving macros', () => {
    const result = computeRecipeNutrition([
      { grams: 100, nutrition: { per100g: nutrients } },
      { grams: 50, nutrition: { per100g: nutrients } },
    ], 2);

    expect(result.complete).toBe(true);
    expect(result.totalGrams).toBe(150);
    expect(result.total.calories).toBe(300);
    expect(result.perServing).toEqual({
      calories: 150,
      protein_g: 7.5,
      carbs_g: 15,
      fat_g: 3.75,
    });
  });

  test('keeps reported subtotals but blocks scoring when a nutrient is missing', () => {
    const missingFiber = { ...nutrients, fiber: null };
    const result = computeRecipeNutrition([
      { grams: 100, nutrition: { per100g: missingFiber } },
    ], 1);

    expect(result.total.calories).toBe(200);
    expect(result.per100g.fiber).toBeNull();
    expect(result.missingNutrients).toContain('fiber');
    expect(result.complete).toBe(false);
    expect(result.scoreEligible).toBe(false);
    expect(result.nutriScore).toBeNull();
  });
});
