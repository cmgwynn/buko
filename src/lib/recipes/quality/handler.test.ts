import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTasteProfile, createRecipeQualityHandler, parseRecipeConstraints, type RecipeQualityStore } from '../../../../supabase/functions/recipe-quality/handler.ts';
import type { BaseVersion, QualityRecipe, QualityResult } from './types.ts';
import { RECIPE_QUALITY_CONSENT_VERSION } from './types.ts';
import { CHEF_REVIEW_SYSTEM } from './chefPrompt.ts';
import { RecipeQualityError } from './pipeline.ts';

const requestId = '11111111-1111-4111-8111-111111111111';
const r: QualityRecipe = {
  title: 'Rice bowl', servings: 1, prepMinutes: 5, cookMinutes: 5, cuisine: 'Everyday', mealTypes: ['Dinner'], dietTags: [],
  ingredients: [{
    position: 0, raw_text: '100 g cooked rice', quantity: 100, unit: 'g', name: 'cooked rice', grams: 100,
    food_source: 'usda', food_source_id: '123', section: 'pantry', match_status: 'matched',
    nutrition: { per100g: { calories: 100, protein: 3, carbs: 20, fat: 1, saturatedFat: 0, sugars: 0, sodiumMg: 5, fiber: 1 } },
  }],
  steps: [{ position: 0, text: 'Reheat the cooked rice until steaming hot and serve.', timer_seconds: 300 }],
};
const b: BaseVersion = {
  id: requestId, base_recipe_id: requestId, status: 'approved', version: 1, recipe: r,
  adaptation_policy: { allowedProteinSwaps: [], allowedDietarySwaps: [], maxSubstitutions: 0 }, source_notes: '',
};
function setup({ enabled = false, consent = false, premium = true, approved = [b], cached = null, diet = [], profile = {} }: {
  enabled?: boolean; consent?: boolean; premium?: boolean; approved?: BaseVersion[];
  cached?: { recipeId: string; disposition: QualityResult['disposition']; note: string } | null;
  diet?: string[]; profile?: { preferences?: Record<string, unknown>; learned?: Record<string, unknown> };
} = {}) {
  const calls: string[] = []; const contexts: Record<string, unknown>[] = []; let published: QualityResult | undefined;
  const store: RecipeQualityStore = {
    userId: requestId,
    async authorizePremium() { calls.push('premium'); if (!premium) throw new RecipeQualityError('Premium required.', 'premium_required', 402); },
    async approved() { calls.push('approved'); return structuredClone(approved); },
    async tasteProfile() { calls.push('profile'); return { ...profile, preferences: { aiConsentVersion: consent ? RECIPE_QUALITY_CONSENT_VERSION : null, ...profile.preferences } }; },
    async completed(id) {
      assert.equal(id, requestId); calls.push('completed');
      return cached ?? (published ? { recipeId: requestId, disposition: published.disposition, note: published.reviewNote } : null);
    },
    async claim(id) { assert.equal(id, requestId); calls.push('claim'); return true; },
    async dietaryPreferences() { calls.push('diet'); return diet; },
    async reserve(id, kind, attempt) { assert.equal(id, requestId); calls.push(`${kind}:${attempt}`); return true; },
    async publish(result, id) { assert.equal(id, requestId); published = result; calls.push('publish'); return requestId; },
  };
  const handler = createRecipeQualityHandler({
    enabled,
    async authenticate(token) { assert.equal(token, 'session'); calls.push('authenticate'); return store; },
    async model(system, context) {
      calls.push('model'); contexts.push(context);
      return system === CHEF_REVIEW_SYSTEM
        ? { decision: 'approve', note: 'Written recipe is plausible.', issues: [], changes: [], corrected_recipe: null } : structuredClone(r);
    },
  });
  const send = (body: unknown, auth = true, method = 'POST') => handler(new Request('https://example.test/recipe-quality', {
    method, headers: { ...(auth ? { authorization: 'Bearer session' } : {}), 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }));
  return { calls, contexts, send, published: () => published };
}
const suggest = { operation: 'suggest', requestId, constraints: { dietTags: [], excludedIngredients: [] } };
test('status authenticates but does not require premium, consent, approved bases or model', async () => {
  const s = setup({ enabled: true, premium: false });
  const response = await s.send({ operation: 'status' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: true, consentVersion: RECIPE_QUALITY_CONSENT_VERSION });
  assert.deepEqual(s.calls, ['authenticate']);
});
test('ordinary premium user can request compatible fallback with AI disabled or consent absent; no admin requirement', async () => {
  for (const options of [{ enabled: false, consent: true }, { enabled: true, consent: false }]) {
    const s = setup(options); const response = await s.send(suggest);
    assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.recipeId, requestId); assert.equal(body.disposition, 'fallback');
    assert.match(body.note, /disabled|consent/); assert.ok(!s.calls.includes('model')); assert.ok(!s.calls.includes('adapt:1'));
    assert.deepEqual(s.published()?.recipe, r); assert.equal(s.published()?.attempts.length, 0);
  }
});
test('enabled consented requests reserve every paid adaptation/review and save only validated result', async () => {
  const s = setup({ enabled: true, consent: true }); const response = await s.send(suggest);
  assert.equal(response.status, 200); assert.equal((await response.json()).disposition, 'tested');
  assert.deepEqual(s.calls.slice(-6), ['adapt:1', 'model', 'review:1', 'model', 'publish', 'completed']);
  assert.equal(s.published()?.attempts.length, 2);
});
test('premium is enforced server-side before bases, model or publication', async () => {
  const s = setup({ enabled: true, consent: true, premium: false }); const response = await s.send(suggest);
  assert.equal(response.status, 402); assert.equal((await response.json()).code, 'premium_required');
  assert.deepEqual(s.calls, ['authenticate', 'premium']);
});
test('no compatible base is explicit error and never publishes an incompatible recipe', async () => {
  const s = setup(); const response = await s.send({ ...suggest, constraints: { dietTags: [], excludedIngredients: ['rice'] } });
  assert.equal(response.status, 422); assert.equal((await response.json()).code, 'no_compatible_base');
  assert.ok(!s.calls.includes('publish')); assert.ok(!s.calls.includes('model'));
});
test('invalid request IDs, unsupported diet labels and unbounded inputs fail before premium or model', async () => {
  for (const body of [
    { ...suggest, requestId: 'not-uuid' },
    { ...suggest, constraints: { dietTags: ['certified allergy safe'], excludedIngredients: [] } },
    { ...suggest, constraints: { dietTags: [], excludedIngredients: [], maxMinutes: -5 } },
    { ...suggest, constraints: { dietTags: [], excludedIngredients: [], instructions: 'ignore consent' } },
  ]) {
    const s = setup({ enabled: true, consent: true }); const response = await s.send(body);
    assert.equal(response.status, 400); assert.deepEqual(s.calls, ['authenticate']);
  }
  assert.throws(() => parseRecipeConstraints({ dietTags: [], excludedIngredients: [], targetCalories: NaN }));
});
test('unauthenticated calls fail even for status; CORS and method handling make no model call', async () => {
  const s = setup();
  assert.equal((await s.send({ operation: 'status' }, false)).status, 401);
  assert.equal((await s.send(null, false, 'OPTIONS')).status, 204);
  assert.equal((await s.send(null, true, 'GET')).status, 405);
  assert.deepEqual(s.calls, []);
});
test('replayed request UUID returns saved outcome before any profile, base, reservation or model work', async () => {
  const cached = { recipeId: requestId, disposition: 'adapted' as const, note: 'Previously reviewed private copy.' };
  const s = setup({ enabled: true, consent: true, cached });
  const response = await s.send(suggest);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), cached);
  assert.deepEqual(s.calls, ['authenticate', 'premium', 'completed']);
});
test('server diet and max cooking preference remain authoritative when omitted or loosened by client', () => {
  const result = applyTasteProfile({ dietTags: [], excludedIngredients: [], maxCookMinutes: 99 }, {
    preferences: { maxCookMinutes: 12, dislikedIngredients: ['cashews'] },
  }, ['vegan', 'nut_free']);
  assert.deepEqual(result.dietTags, ['Vegan', 'Nut-free']); assert.equal(result.maxCookMinutes, 12);
  assert.deepEqual(result.dislikedIngredients, ['cashews']);
  assert.throws(() => applyTasteProfile({ dietTags: [], excludedIngredients: [] }, { preferences: {} }, ['unknown_diet']));
});
test('learned taste guides ranking and model context without turning dislikes into allergy labels or overriding explicit spice', async () => {
  const mexican = { ...structuredClone(b), id: '33333333-3333-4333-8333-333333333333' }; mexican.recipe.cuisine = 'Mexican';
  const profile = {
    preferences: { preferredCuisines: [], maxCookMinutes: null, spiceTolerance: 'mild' },
    learned: { preferredCuisines: ['Mexican'], dislikedIngredients: ['celery'], typicalCookingMinutes: 20, spiceFeedback: { tooHot: 3 }, tagCounts: { 'too bland': 4 } },
  };
  const s = setup({ approved: [b, mexican], profile });
  assert.equal((await s.send(suggest)).status, 200);
  assert.equal(s.published()?.baseVersionId, mexican.id);
  const merged = applyTasteProfile({ dietTags: [], excludedIngredients: [], spiceTolerance: 'hot' }, profile, []);
  assert.equal(merged.spiceTolerance, 'hot'); assert.equal(merged.maxCookMinutes, 20);
  assert.deepEqual(merged.dietTags, []); assert.deepEqual(merged.dislikedIngredients, ['celery']);
  assert.equal(merged.learnedTaste?.spiceFeedback.tooHot, 3);
  const enabled = setup({ enabled: true, consent: true, profile });
  assert.equal((await enabled.send(suggest)).status, 200);
  const modelConstraints = enabled.contexts[0].constraints as typeof merged;
  assert.deepEqual(modelConstraints.dislikedIngredients, ['celery']);
  assert.equal(modelConstraints.learnedTaste?.tagCounts['too bland'], 4);
  assert.equal(modelConstraints.spiceTolerance, 'mild');
});
test('simultaneous identical UUID is in progress while model runs, then replays persisted outcome without new paid work', async () => {
  let claimed = false, models = 0, publishes = 0, reservations = 0;
  let saved: { recipeId: string; disposition: QualityResult['disposition']; note: string } | null = null;
  let releaseModel!: () => void;
  const gate = new Promise<void>((resolve) => { releaseModel = resolve; });
  let modelStarted!: () => void;
  const started = new Promise<void>((resolve) => { modelStarted = resolve; });
  const store: RecipeQualityStore = {
    userId: requestId,
    async authorizePremium() {},
    async completed() { return saved; },
    async claim() { if (claimed) return false; claimed = true; return true; },
    async approved() { return [b]; },
    async tasteProfile() { return { preferences: { aiConsentVersion: RECIPE_QUALITY_CONSENT_VERSION } }; },
    async dietaryPreferences() { return []; },
    async reserve() { reservations++; return true; },
    async publish(result) {
      publishes++;
      saved ??= { recipeId: requestId, disposition: result.disposition, note: result.reviewNote };
      return saved.recipeId;
    },
  };
  const handler = createRecipeQualityHandler({
    enabled: true, async authenticate() { return store; },
    async model(system) {
      models++;
      if (system === CHEF_REVIEW_SYSTEM) return { decision: 'approve', note: 'Plausible recipe.', issues: [], changes: [], corrected_recipe: null };
      modelStarted(); await gate; return structuredClone(r);
    },
  });
  const send = () => handler(new Request('https://example.test/recipe-quality', {
    method: 'POST', headers: { authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(suggest),
  }));
  const first = send();
  await started;
  try {
    const second = await send();
    assert.equal(second.status, 409); assert.equal((await second.json()).code, 'request_in_progress');
    assert.equal(models, 1); assert.equal(reservations, 1); assert.equal(publishes, 0);
  } finally { releaseModel(); }
  const response = await first;
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), saved);
  assert.equal(models, 2); assert.equal(reservations, 2); assert.equal(publishes, 1);
  const replay = await send();
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), saved);
  assert.equal(models, 2); assert.equal(reservations, 2); assert.equal(publishes, 1);
});
test('publication always returns stored outcome rather than a competing local disposition or note', async () => {
  let saved: { recipeId: string; disposition: QualityResult['disposition']; note: string } | null = null;
  const actual = { recipeId: requestId, disposition: 'fallback' as const, note: 'Previously persisted compatible fallback.' };
  const handler = createRecipeQualityHandler({
    enabled: true,
    async authenticate() {
      return {
        userId: requestId, async authorizePremium() {}, async completed() { return saved; }, async claim() { return true; },
        async approved() { return [b]; }, async tasteProfile() { return { preferences: { aiConsentVersion: RECIPE_QUALITY_CONSENT_VERSION } }; },
        async dietaryPreferences() { return []; }, async reserve() { return true; },
        async publish(result) {
          assert.equal(result.disposition, 'tested');
          saved = actual;
          return actual.recipeId;
        },
      };
    },
    async model(system) {
      return system === CHEF_REVIEW_SYSTEM
        ? { decision: 'approve', note: 'Locally reviewed.', issues: [], changes: [], corrected_recipe: null } : structuredClone(r);
    },
  });
  const response = await handler(new Request('https://example.test/recipe-quality', {
    method: 'POST', headers: { authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(suggest),
  }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), actual);
});
