import assert from 'node:assert/strict';
import test from 'node:test';
import type { IngredientDraft } from '../types.ts';
import { checkRecipe, isQualityRecipe } from './checks.ts';
import type { BaseVersion, QualityRecipe } from './types.ts';

export function ingredient(name: string, grams = 100, unit = 'g', quantity = grams): IngredientDraft {
  return {
    position: 0, raw_text: `${quantity} ${unit} ${name}`, name, grams, unit, quantity,
    food_source: 'usda', food_source_id: name, section: 'pantry', match_status: 'matched',
    nutrition: { per100g: { calories: 100, protein: 10, carbs: 10, fat: 2, sugars: 1, saturatedFat: 0.5, sodiumMg: 10, fiber: 2 }, category: 'Vegetables' },
  };
}
export function recipe(ingredients = [ingredient('cooked rice'), ingredient('lemon juice', 10), ingredient('olive oil', 5)]): QualityRecipe {
  return {
    title: 'Lemon rice bowl', servings: 2, prepMinutes: 5, cookMinutes: 5, cuisine: 'Everyday', mealTypes: ['Dinner'], dietTags: [],
    ingredients: ingredients.map((i, position) => ({ ...i, position })),
    steps: [{ position: 0, text: 'Warm all ingredients together until steaming hot and serve.', timer_seconds: 300 }],
  };
}
export function base(r = recipe()): BaseVersion {
  return {
    id: '11111111-1111-4111-8111-111111111111', base_recipe_id: '22222222-2222-4222-8222-222222222222',
    version: 1, status: 'approved', recipe: r,
    adaptation_policy: { allowedProteinSwaps: [], allowedDietarySwaps: [], maxSubstitutions: 0 }, source_notes: 'Kitchen tested',
  };
}
test('strict recipe schema blocks invalid quantities, metadata, extras and empty steps', () => {
  assert.equal(isQualityRecipe(recipe()), true);
  for (const invalid of [
    { ...recipe(), servings: 0 }, { ...recipe(), servings: NaN }, { ...recipe(), cookMinutes: -1 },
    { ...recipe(), title: '' }, { ...recipe(), steps: [] }, { ...recipe(), nutrition: {} },
    { ...recipe(), cuisine: 'Authentic' }, { ...recipe(), mealTypes: [] },
    recipe([ingredient('rice', -1)]),
  ]) assert.equal(checkRecipe(invalid).valid, false);
});
test('salt per serving boundaries normalize grams, tsp, tablespoons and servings', () => {
  const highG = checkRecipe(recipe([ingredient('salt', 4.02)]));
  assert.ok(highG.issues.some((i) => /Salt is high/.test(i.detail)));
  assert.ok(!checkRecipe(recipe([ingredient('salt', 4)])).issues.some((i) => /Salt is high/.test(i.detail)));
  assert.ok(checkRecipe(recipe([ingredient('salt', 5.914704, 'tsp', 1)])).issues.some((i) => /Salt is high/.test(i.detail)));
  assert.ok(checkRecipe(recipe([ingredient('salt', 17.74416, 'tbsp', 1)])).issues.some((i) => /Salt is high/.test(i.detail)));
  const larger = recipe([ingredient('salt', 4.02)]); larger.servings = 4;
  assert.ok(!checkRecipe(larger).issues.some((i) => /Salt is high/.test(i.detail)));
  assert.ok(checkRecipe(recipe([ingredient('salt', 0.1)])).issues.some((i) => /low per serving/.test(i.detail)));
});
test('missing salt/acid warnings are contextual, not mandatory seasoning or invalidation', () => {
  const bland = checkRecipe(recipe([ingredient('cooked rice')]));
  assert.equal(bland.valid, true);
  assert.ok(bland.issues.some((i) => /No obvious salt/.test(i.detail)));
  assert.ok(bland.issues.some((i) => /No obvious acid/.test(i.detail)));
  const oats = checkRecipe(recipe([ingredient('rolled oats'), ingredient('banana')]));
  assert.equal(oats.valid, true);
  assert.ok(!oats.issues.some((i) => /No obvious (salt|acid)/.test(i.detail)));
});
test('combined concentrated sodium and weeknight complexity are reported', () => {
  const soy = ingredient('soy sauce'); soy.nutrition!.per100g.sodiumMg = 3000;
  assert.ok(checkRecipe(recipe([soy])).issues.some((i) => /Concentrated sodium/.test(i.detail)));
  assert.ok(checkRecipe(recipe(Array.from({ length: 13 }, (_, i) => ingredient(`vegetable ${i}`)))).issues.some((i) => /12 ingredients/.test(i.detail)));
});
test('hard diets and exclusions inspect actual ingredients rather than trusting labels', () => {
  const meat = recipe([ingredient('raw chicken breast')]); meat.dietTags = ['Vegan'];
  assert.equal(checkRecipe(meat).valid, false);
  assert.equal(checkRecipe(recipe([ingredient('cashew butter')]), { dietTags: ['Nut-free'], excludedIngredients: [] }).valid, false);
  assert.equal(checkRecipe(recipe(), { dietTags: [], excludedIngredients: ['rice'] }).valid, false);
  assert.equal(checkRecipe(recipe([ingredient('almond milk')]), { dietTags: ['Dairy-free'], excludedIngredients: [] }).valid, true);
  assert.equal(checkRecipe(recipe([ingredient('gluten-free pasta')]), { dietTags: ['Gluten-free'], excludedIngredients: [] }).valid, true);
  assert.equal(checkRecipe(recipe([ingredient('vegan cheese containing milk')]), { dietTags: ['Vegan'], excludedIngredients: [] }).valid, false);
  assert.equal(checkRecipe(recipe([ingredient('gluten-free wheat pasta')]), { dietTags: ['Gluten-free'], excludedIngredients: [] }).valid, false);
});
test('raw poultry requires plausible cook time and internal temperature, not oven setting', () => {
  const poultry = recipe([ingredient('raw chicken breast')]); poultry.cookMinutes = 25;
  poultry.steps[0].text = 'Bake chicken in an oven at 165 F for 25 minutes.';
  assert.equal(checkRecipe(poultry).valid, false);
  poultry.steps[0].text = 'Roast chicken until the thickest part reaches an internal temperature of 165 F measured with a thermometer.';
  assert.equal(checkRecipe(poultry).valid, true);
  poultry.cookMinutes = 2;
  assert.equal(checkRecipe(poultry).valid, false);
});
test('nutrition alteration and quantity/weight mismatches block; macros use authoritative recomputation', () => {
  const r = recipe(); const trusted = structuredClone(r.ingredients);
  r.ingredients[0].nutrition!.per100g.protein = 99;
  assert.equal(checkRecipe(r, undefined, trusted).valid, false);
  const inconsistent = recipe(); inconsistent.ingredients[0].grams = 200;
  assert.equal(checkRecipe(inconsistent).valid, false);
  assert.equal(checkRecipe(recipe(), { dietTags: [], excludedIngredients: [], targetProtein: 100 }).valid, false);
  assert.equal(checkRecipe(recipe(), { dietTags: [], excludedIngredients: [], targetCalories: 60 }).valid, true);
  const missing = recipe(); missing.ingredients[0].nutrition!.per100g.protein = null;
  assert.equal(checkRecipe(missing, { dietTags: [], excludedIngredients: [], targetProtein: 1 }).valid, false);
});
