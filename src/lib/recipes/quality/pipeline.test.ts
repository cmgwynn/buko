import assert from 'node:assert/strict';
import test from 'node:test';
import type { IngredientDraft } from '../types.ts';
import { CHEF_REVIEW_PROMPT_VERSION, CHEF_REVIEW_SYSTEM } from './chefPrompt.ts';
import { canonicalCatalog, parseChefReview, RecipeQualityError, suggestRecipe, validateAdaptation } from './pipeline.ts';
import type { BaseVersion, QualityRecipe, RecipeModel } from './types.ts';

function ingredient(name: string, grams = 100): IngredientDraft {
  return {
    position: 0, raw_text: `${grams} g ${name}`, name, grams, unit: 'g', quantity: grams,
    food_source: 'usda', food_source_id: name, section: 'pantry', match_status: 'matched',
    nutrition: { per100g: { calories: 100, protein: 10, carbs: 10, fat: 2, sugars: 1, saturatedFat: 0.5, sodiumMg: 10, fiber: 2 }, category: 'Vegetables' },
  };
}
function recipe(ingredients = [ingredient('cooked rice'), ingredient('lemon juice', 10), ingredient('olive oil', 5)]): QualityRecipe {
  return {
    title: 'Lemon rice bowl', servings: 2, prepMinutes: 5, cookMinutes: 5, cuisine: 'Everyday', mealTypes: ['Dinner'], dietTags: [],
    ingredients: ingredients.map((i, position) => ({ ...i, position })),
    steps: [{ position: 0, text: 'Warm all ingredients together until steaming hot and serve.', timer_seconds: 300 }],
  };
}
function base(r = recipe()): BaseVersion {
  return {
    id: '11111111-1111-4111-8111-111111111111', base_recipe_id: '22222222-2222-4222-8222-222222222222',
    version: 1, status: 'approved', recipe: r,
    adaptation_policy: { allowedProteinSwaps: [], allowedDietarySwaps: [], maxSubstitutions: 0 }, source_notes: 'Kitchen tested',
  };
}

const constraints = { dietTags: [], excludedIngredients: [] };
const review = (decision: 'approve' | 'fix' | 'reject' = 'approve', corrected_recipe: unknown = null) => ({
  decision, note: decision === 'reject' ? 'Technique is not coherent.' : 'Plausible written recipe.', issues: [], changes: [], corrected_recipe,
});
test('versioned full chef prompt retains trust boundaries, culinary review and exact JSON instructions', () => {
  assert.equal(CHEF_REVIEW_PROMPT_VERSION, 'chef-review-v1');
  for (const text of ['professional chef', 'not physically', 'inert data', 'food safety > approved adaptation scope',
    'salt, acid, fat, sweetness and heat', 'aromatics', 'textural', 'per-serving', 'concentrated sodium',
    'oven temperature', 'internal temperature', 'authoritative safety references', 'every ingredient',
    'weeknight complexity', 'complete corrected recipe', 'No extra fields', 'hidden reasoning',
    'Never invent', 'corrected_recipe', 'bounded regeneration', 'unchanged compatible approved base']) {
    assert.ok(CHEF_REVIEW_SYSTEM.includes(text), `Chef prompt must retain ${text}`);
  }
});
test('AI off uses unchanged compatible approved fallback, without model calls or reservations', async () => {
  const b = base(); const before = structuredClone(b);
  const result = await suggestRecipe({
    bases: [b], constraints, enabled: false,
    model: async () => { assert.fail('must not call model'); }, reserve: async () => { assert.fail('must not reserve'); },
  });
  assert.equal(result.disposition, 'fallback'); assert.equal(result.attempts.length, 0);
  assert.match(result.reviewNote, /disabled.*unchanged compatible/);
  assert.deepEqual(result.recipe, b.recipe); assert.deepEqual(b, before);
  result.recipe.title = 'Changed private copy'; assert.deepEqual(b, before);
});
test('missing or incompatible approved bases fail explicitly, never substitute incompatible fallback', async () => {
  const missingNutrition = base(); missingNutrition.recipe.ingredients[0].nutrition = null;
  for (const bases of [[], [base(recipe([ingredient('chicken')]))], [{ ...base(), status: 'draft' }], [missingNutrition]]) {
    await assert.rejects(suggestRecipe({ bases, constraints: { dietTags: ['Vegan'], excludedIngredients: [] }, enabled: false }),
      (e: unknown) => e instanceof RecipeQualityError && e.code === 'no_compatible_base');
  }
});
test('two rejected candidates exhaust exactly one regeneration then return unchanged compatible base', async () => {
  const b = base(); const calls: string[] = []; const reservations: string[] = [];
  const result = await suggestRecipe({
    bases: [b], constraints, enabled: true,
    reserve: async (kind, attempt) => { reservations.push(`${kind}:${attempt}`); return true; },
    model: async (system) => { calls.push(system); return system === CHEF_REVIEW_SYSTEM ? review('reject') : structuredClone(b.recipe); },
  });
  assert.equal(result.disposition, 'fallback'); assert.equal(result.attempts.length, 4); assert.deepEqual(result.recipe, b.recipe);
  assert.equal(calls.length, 4); assert.deepEqual(reservations, ['adapt:1', 'review:1', 'adapt:2', 'review:2']);
  assert.match(result.reviewNote, /rejected.*bounded retry/);
});
test('reviewer fixed candidate must pass structure, diet, trusted nutrition and policy again', async () => {
  const b = base();
  for (const fix of [
    { ...b.recipe, servings: 0 }, { ...b.recipe, ingredients: [ingredient('beef')] },
    (() => { const r = structuredClone(b.recipe); r.ingredients[0].nutrition!.per100g.calories = 1; return r; })(),
  ]) {
    const result = await suggestRecipe({
      bases: [b], constraints, enabled: true, reserve: async () => true,
      model: async (system) => system === CHEF_REVIEW_SYSTEM ? review('fix', fix) : structuredClone(b.recipe),
    });
    assert.equal(result.disposition, 'fallback'); assert.deepEqual(result.recipe, b.recipe);
  }
});
test('malformed and timeout model outputs use bounded explicit fallback', async () => {
  for (const model of [async () => ({ wrong: true }), async () => new Promise(() => {})] as RecipeModel[]) {
    let calls = 0;
    const result = await suggestRecipe({
      bases: [base()], constraints, enabled: true, reserve: async () => true, timeoutMs: 5,
      model: async (...args) => { calls++; return model(...args); },
    });
    assert.equal(calls, 2); assert.equal(result.disposition, 'fallback'); assert.equal(result.attempts.length, 2);
    assert.match(result.reviewNote, /bounded retry/);
  }
});
test('malformed reviewer output rejects each candidate and cannot bypass bounded fallback', async () => {
  let calls = 0; const b = base();
  const result = await suggestRecipe({
    bases: [b], constraints, enabled: true, reserve: async () => true,
    model: async (system) => { calls++; return system === CHEF_REVIEW_SYSTEM ? { decision: 'approve' } : b.recipe; },
  });
  assert.equal(calls, 4); assert.equal(result.disposition, 'fallback');
  assert.match(result.reviewNote, /malformed.*bounded retry/);
  assert.deepEqual(result.attempts.map((a) => a.outcome), ['accepted', 'invalid', 'accepted', 'invalid']);
});
test('complete reviewer fixes are revalidated and accepted only inside the base policy', async () => {
  const b = base(); const fixed = structuredClone(b.recipe); fixed.steps[0].text = 'Warm all ingredients until steaming hot. Serve with a fork.';
  const result = await suggestRecipe({
    bases: [b], constraints, enabled: true, reserve: async () => true,
    model: async (system) => system === CHEF_REVIEW_SYSTEM ? review('fix', fixed) : b.recipe,
  });
  assert.equal(result.disposition, 'adapted'); assert.deepEqual(result.recipe, fixed);
});
test('quota denial makes no model call and is visibly described', async () => {
  const result = await suggestRecipe({
    bases: [base()], constraints, enabled: true, reserve: async () => false,
    model: async () => { assert.fail('no model call without reservation'); },
  });
  assert.equal(result.disposition, 'fallback'); assert.match(result.reviewNote, /limit was reached/);
});
test('valid review approves complete candidate, notes uncertainty and records prompt version', async () => {
  const b = base();
  const result = await suggestRecipe({
    bases: [b], constraints, enabled: true, reserve: async () => true,
    model: async (system) => system === CHEF_REVIEW_SYSTEM ? review() : b.recipe,
  });
  assert.equal(result.disposition, 'tested'); assert.equal(result.promptVersion, CHEF_REVIEW_PROMPT_VERSION);
  assert.match(result.reviewNote, /not physically tasted/);
});
test('canonical swaps require policy and existing verified nutrition, not model invention', () => {
  const b = base(); b.adaptation_policy.allowedDietarySwaps = ['lime juice']; b.adaptation_policy.maxSubstitutions = 1;
  const other = { ...base(recipe([ingredient('lime juice', 10)])), id: 'other' };
  const catalog = canonicalCatalog([b, other], b);
  assert.ok(catalog.some((i) => i.name === 'lime juice'));
  const changed = structuredClone(b.recipe); changed.ingredients[1] = { ...ingredient('lime juice', 10), position: 1 };
  assert.deepEqual(validateAdaptation(changed, b, catalog, constraints), changed);
  changed.ingredients[1].nutrition!.per100g.sodiumMg = 123;
  assert.throws(() => validateAdaptation(changed, b, catalog, constraints), /Untrusted/);
});
test('portion scaling cannot simply multiply cooking time', () => {
  const b = base(); const scaled = structuredClone(b.recipe); scaled.servings *= 2; scaled.cookMinutes *= 2;
  assert.throws(() => validateAdaptation(scaled, b, b.recipe.ingredients, constraints), /linearly/);
});
test('retained amounts scale consistently with servings and bounded nonuniform changes count against policy', () => {
  const b = base(); const scaled = structuredClone(b.recipe); scaled.servings *= 2;
  assert.throws(() => validateAdaptation(scaled, b, b.recipe.ingredients, constraints), /scale with servings/);
  for (const i of scaled.ingredients) { i.grams! *= 2; i.quantity! *= 2; }
  assert.deepEqual(validateAdaptation(scaled, b, b.recipe.ingredients, constraints), scaled);
  scaled.ingredients[0].grams! *= 1.1; scaled.ingredients[0].quantity! *= 1.1;
  assert.throws(() => validateAdaptation(scaled, b, b.recipe.ingredients, constraints), /nonuniform quantity changes/);
  b.adaptation_policy.maxSubstitutions = 1;
  assert.deepEqual(validateAdaptation(scaled, b, b.recipe.ingredients, constraints), scaled);
  scaled.ingredients[0].grams! = 300; scaled.ingredients[0].quantity! = 300;
  assert.throws(() => validateAdaptation(scaled, b, b.recipe.ingredients, constraints), /capped at 20/);
});
test('review JSON contract is exact and rejects fabricated extra fields or contradictory approval', () => {
  assert.throws(() => parseChefReview({ ...review(), nutrition: {} }));
  assert.throws(() => parseChefReview({ ...review(), note: 'x'.repeat(301) }));
  assert.throws(() => parseChefReview({ ...review(), corrected_recipe: recipe() }));
  assert.throws(() => parseChefReview({ ...review(), issues: [{ category: 'scope', severity: 'blocking', detail: 'Unsafe.' }] }));
});
test('deep formulation equality is independent of JSON object key order', async () => {
  const b = base(); const reordered = Object.fromEntries(Object.entries(b.recipe).reverse());
  const result = await suggestRecipe({
    bases: [b], constraints, enabled: true, reserve: async () => true,
    model: async (system) => system === CHEF_REVIEW_SYSTEM ? review() : reordered,
  });
  assert.equal(result.disposition, 'tested'); assert.deepEqual(result.changes, []);
});
