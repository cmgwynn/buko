import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Nutrients } from '../../../types';
import { computeRecipeNutrition, recipeLoggingError, recipeNutritionMessage, scoreRecipe } from '../nutrition';

const nutrients: Nutrients = { calories: 100, protein: 10, carbs: 12, fat: 3, sugars: 0, saturatedFat: 0, sodiumMg: 0, fiber: 3 };
const ingredient = (overrides: Partial<Nutrients> = {}, grams: number | null = 100) => ({
  grams, nutrition: { per100g: { ...nutrients, ...overrides }, category: 'Vegetables' },
});

describe('honest recipe nutrition completeness', () => {
  it('keeps the numeric total and perServing shapes for complete recipes, including known zero nutrients', () => {
    const result = computeRecipeNutrition([ingredient()], 2);
    assert.equal(result.complete, true);
    assert.equal(result.scoreEligible, true);
    assert.deepEqual(result.total, { calories: 100, protein_g: 10, carbs_g: 12, fat_g: 3 });
    assert.deepEqual(result.perServing, { calories: 50, protein_g: 5, carbs_g: 6, fat_g: 1.5 });
    assert.equal(recipeNutritionMessage(result), null);
    assert.equal(recipeLoggingError(result, 1), null);
    assert.notEqual(scoreRecipe('Complete', result).score, null);
  });

  for (const key of Object.keys(nutrients) as (keyof Nutrients)[]) {
    it(`does not zero-fill missing ${key} into a score or logged entry`, () => {
      const result = computeRecipeNutrition([ingredient({ [key]: null })], 2);
      assert.equal(result.complete, false);
      assert.equal(result.scoreEligible, false);
      assert.equal(result.incompleteIngredients, 1);
      assert.deepEqual(result.missingNutrients, [key]);
      assert.equal(result.per100g[key], null);
      assert.equal(result.nutriScore, null);
      assert.equal(scoreRecipe('Partial', result).score, null);
      assert.match(recipeLoggingError(result, 1)!, /incomplete/);
    });
  }

  it('does not let a fully matched ingredient hide an unmatched or partially matched one', () => {
    const result = computeRecipeNutrition([ingredient(), ingredient({ sugars: null }), { grams: 100, nutrition: null }], 3);
    assert.equal(result.counted, 2);
    assert.equal(result.excluded, 1);
    assert.equal(result.incompleteIngredients, 2);
    assert.equal(result.complete, false);
    assert.equal(result.total.calories, 200);
    assert.equal(result.per100g.sugars, null);
    assert.equal(scoreRecipe('Partial', result).confidence, 0);
  });

  for (const grams of [null, 0, -1, NaN, Infinity]) {
    it(`rejects invalid ingredient weight ${grams}`, () => {
      const result = computeRecipeNutrition([ingredient({}, grams)], 2);
      assert.equal(result.complete, false);
      assert.equal(result.excluded, 1);
      assert.match(recipeLoggingError(result, 1)!, /incomplete/);
    });
  }

  for (const value of [NaN, Infinity, -1]) {
    it(`rejects invalid nutrient value ${value} without poisoning numeric subtotals`, () => {
      const result = computeRecipeNutrition([ingredient({ calories: value })], 2);
      assert.equal(result.complete, false);
      assert.equal(result.total.calories, 0);
      assert.equal(result.per100g.calories, null);
      assert.equal(scoreRecipe('Invalid', result).score, null);
    });
  }

  it('rejects empty recipes and invalid recipe or logged serving counts', () => {
    assert.equal(computeRecipeNutrition([], 4).complete, false);
    for (const servings of [0, -1, NaN, Infinity]) {
      assert.equal(computeRecipeNutrition([ingredient()], servings).complete, false);
      assert.match(recipeLoggingError(computeRecipeNutrition([ingredient()], 4), servings)!, /positive/);
    }
  });

  it('rejects overflowing servings instead of scoring or logging non-finite nutrition', () => {
    assert.equal(computeRecipeNutrition([ingredient()], Number.MIN_VALUE).complete, false);
    assert.match(recipeLoggingError(computeRecipeNutrition([ingredient()], 1), Number.MAX_VALUE)!, /valid number/);
  });
});
