import assert from 'node:assert/strict';
import test from 'node:test';
import type { DietPref, Nutrients } from '../../types/index.ts';
import { STARTER_RECIPES, starterRecipeDraft } from './library.ts';
import { candidateMacros, hasDietConflict, intakeMacros, recommendMeals, type KnownMacros, type MealCandidate } from './recommendations.ts';

const nutrients: Nutrients = { calories: 400, protein: 30, carbs: 50, fat: 10, sugars: 5, saturatedFat: 2, sodiumMg: 100, fiber: 4 };
const targets: KnownMacros = { calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 50 };
function candidate(id: string, values: Partial<Nutrients> = {}): MealCandidate {
  return { id, title: id, source: 'saved', servings: 1,
    ingredients: [{ name: 'rice and beans', grams: 100, nutrition: { per100g: { ...nutrients, ...values } } }] };
}
function recommend(overrides: Partial<Parameters<typeof recommendMeals>[0]> = {}) {
  return recommendMeals({ candidates: [candidate('bowl')], preferences: [], targets, meal: 'dinner', planned: [], intake: null, isToday: true, ...overrides });
}

test('one serving uses stored ingredient nutrients and recipe yield, without inventing missing macros', () => {
  const bowl = candidate('bowl', { protein: null });
  bowl.servings = 2;
  assert.deepEqual(candidateMacros(bowl), { calories: 200, protein_g: null, carbs_g: 25, fat_g: 5 });
  bowl.ingredients = [...bowl.ingredients, { name: 'unmatched sauce', grams: 20, nutrition: null }];
  assert.deepEqual(candidateMacros(bowl), { calories: null, protein_g: null, carbs_g: null, fat_g: null });
});

test('missing weights, empty recipes, invalid yields and overflow never become usable zero nutrition', () => {
  const bowl = candidate('bowl');
  for (const grams of [null, 0, -1, NaN, Infinity]) {
    assert.equal(candidateMacros({ ...bowl, ingredients: [{ ...bowl.ingredients[0], grams }] }).calories, null);
  }
  for (const servings of [0, -1, NaN, Infinity]) assert.equal(candidateMacros({ ...bowl, servings }).calories, null);
  assert.equal(candidateMacros({ ...bowl, ingredients: [] }).calories, null);
  assert.equal(candidateMacros({ ...bowl, ingredients: [{ ...bowl.ingredients[0], grams: Number.MAX_VALUE }] }).calories, null);
  const missingSnapshot = { ...bowl, ingredients: [{ ...bowl.ingredients[0], nutrition: {} }] } as unknown as MealCandidate;
  assert.equal(candidateMacros(missingSnapshot).calories, null);
});

test('reported zero is preserved; missing secondary nutrients do not invalidate reported macros', () => {
  assert.deepEqual(candidateMacros(candidate('bowl', { calories: 0, protein: 0, fiber: null })),
    { calories: 0, protein_g: 0, carbs_g: 50, fat_g: 10 });
  for (const calories of [null, -10, NaN, Infinity]) assert.equal(candidateMacros(candidate('bad', { calories })).calories, null);
});

test('diet preferences and explicit conflicting tags exclude ingredients, not certify safety', () => {
  const examples: [DietPref, string][] = [
    ['vegan', 'eggs and honey'], ['vegetarian', 'raw chicken breast'], ['vegetarian', 'prawns'], ['vegan', 'bacon'],
    ['gluten_free', 'whole-wheat pasta'], ['dairy_free', 'cream and whey'], ['nut_free', 'peanut butter'],
    ['vegan', 'unspecified broth'], ['nut_free', 'cashews'],
  ];
  for (const [pref, name] of examples) {
    const bowl = { ...candidate('bowl'), ingredients: [{ ...candidate('bowl').ingredients[0], name }] };
    assert.equal(hasDietConflict(bowl, [pref]), true, `${pref}: ${name}`);
    assert.equal(recommend({ candidates: [bowl], preferences: [pref] }).recommendations.length, 0);
  }
  const falseTag = { ...candidate('false vegan'), dietTags: ['Vegan'], ingredients: [{ ...candidate('bowl').ingredients[0], name: 'chicken' }] };
  assert.equal(recommend({ candidates: [falseTag] }).recommendations.length, 0);
  assert.equal(hasDietConflict(candidate('untagged'), ['nut_free']), false);
});

test('named plant substitutions do not hide an additional explicit conflict', () => {
  const named = (name: string) => ({ ...candidate('bowl'), ingredients: [{ ...candidate('bowl').ingredients[0], name }] });
  assert.equal(hasDietConflict(named('almond milk'), ['dairy_free']), false);
  assert.equal(hasDietConflict(named('almond milk'), ['nut_free']), true);
  assert.equal(hasDietConflict(named('almond milk with dairy cream'), ['dairy_free']), true);
  assert.equal(hasDietConflict(named('gluten-free pasta'), ['gluten_free']), false);
  assert.equal(hasDietConflict(named('gluten-free wheat pasta'), ['gluten_free']), true);
});

test('intake distinguishes an empty successful log from missing or invalid values', () => {
  assert.deepEqual(intakeMacros([]), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  assert.deepEqual(intakeMacros([{ calories: 100, protein_g: 10, carbs_g: 5, fat_g: 2 }, { calories: 200, carbs_g: 10, fat_g: -1 }]),
    { calories: 300, protein_g: null, carbs_g: 15, fat_g: null });
  assert.equal(intakeMacros([{ calories: Number.MAX_VALUE }, { calories: Number.MAX_VALUE }]).calories, null);
});

test('today uses intake and reserves only unlogged plans, without double counting logged meals', () => {
  const result = recommend({
    candidates: [candidate('logged'), candidate('planned'), candidate('new')],
    planned: [
      { recipeId: 'logged', meal: 'breakfast', servings: 1, logged: true },
      { recipeId: 'planned', meal: 'lunch', servings: 2, logged: false },
    ],
    intake: { calories: 500, protein_g: 40, carbs_g: 60, fat_g: 15 },
  });
  assert.equal(result.usedIntake, true);
  assert.deepEqual(result.remaining, { calories: 700, protein_g: 50, carbs_g: 90, fat_g: 15 });
  assert.ok(Math.abs(result.budget.calories! - 700 * 0.35 / 0.45) < 1e-8);
  assert.deepEqual(result.recommendations.map((idea) => idea.candidate.id), ['new']);
});

test('past/future dates ignore today intake; unavailable intake falls back to all planned meals', () => {
  const planned = [{ recipeId: 'bowl', meal: 'breakfast' as const, servings: 1, logged: true }];
  const fallback = recommend({ planned });
  const future = recommend({ planned, isToday: false, intake: targets });
  assert.equal(fallback.usedIntake, false);
  assert.equal(future.usedIntake, false);
  assert.deepEqual(future.remaining, fallback.remaining);
  assert.equal(fallback.remaining.calories, 1600);
  assert.equal(recommend({ planned, intake: intakeMacros([]) }).remaining.calories, 2000);
});

test('unknown reserved nutrition or intake only disables affected goal dimensions', () => {
  const result = recommend({
    candidates: [candidate('planned', { protein: null }), candidate('new')],
    planned: [{ recipeId: 'planned', meal: 'lunch', servings: 1, logged: false }],
    intake: { calories: 100, protein_g: 10, carbs_g: null, fat_g: 2 },
  });
  assert.equal(result.incompletePlan, true);
  assert.deepEqual(result.remaining, { calories: 1500, protein_g: null, carbs_g: null, fat_g: 38 });
  const missingRecipe = recommend({ planned: [{ recipeId: 'deleted', meal: 'lunch', servings: 1, logged: false }] });
  assert.deepEqual(missingRecipe.remaining, { calories: null, protein_g: null, carbs_g: null, fat_g: null });
});

test('targets are authoritative; no targets/invalid dimensions mean no invented budget, overshoots clamp to zero', () => {
  assert.deepEqual(recommend({ targets: null }).budget, { calories: null, protein_g: null, carbs_g: null, fat_g: null });
  assert.equal(recommend({ targets: { calories: -1, protein_g: NaN, carbs_g: 0 } }).budget.calories, null);
  assert.equal(recommend({ targets: { calories: 1000 } }).budget.calories, 350);
  assert.equal(recommend({ targets: { calories: 3000 } }).budget.calories, 1050);
  assert.equal(recommend({ intake: { calories: 2500, protein_g: 200, carbs_g: 300, fat_g: 100 } }).remaining.calories, 0);
});

test('ranking is deterministic across input ordering, prioritizes complete comparable data and goal fit', () => {
  const close = candidate('close', { calories: 700, protein: 52.5, carbs: 87.5, fat: 17.5 });
  const others = [candidate('far'), candidate('missing', { calories: null }), close];
  const forward = recommend({ candidates: others, limit: 10 });
  const reverse = recommend({ candidates: [...others].reverse(), limit: 10 });
  assert.deepEqual(forward, reverse);
  assert.equal(forward.recommendations[0].candidate.id, 'close');
  assert.equal(forward.recommendations[2].candidate.id, 'missing');
});

test('calories and all three macros influence goal fit', () => {
  const base = { calories: 700, protein: 52.5, carbs: 87.5, fat: 17.5 };
  for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const exact = candidate('exact', base);
    const off = candidate('off', { ...base, [key]: base[key] * 2 });
    assert.equal(recommend({ candidates: [off, exact] }).recommendations[0].candidate.id, 'exact');
  }
});

test('meal metadata filters library choices; saved recipes remain usable; duplicates prefer saved', () => {
  const saved = candidate('saved');
  const library = { ...saved, id: 'library', source: 'library' as const, meal: 'dinner' as const };
  const breakfast = { ...candidate('breakfast'), source: 'library' as const, meal: 'breakfast' as const };
  assert.deepEqual(recommend({ candidates: [library, breakfast, saved] }).recommendations.map((idea) => idea.candidate.id), ['saved']);
  assert.equal(recommend({ candidates: [], limit: 0 }).recommendations.length, 0);
  assert.equal(recommend({ limit: -1 }).recommendations.length, 0);
  assert.equal(recommend({ candidates: [saved, library], planned: [{ recipeId: saved.id, meal: 'lunch', servings: 1, logged: false }] }).recommendations.length, 0);
});

test('recommendation calculation does not mutate candidate or plan input', () => {
  const input = { candidates: [candidate('z'), candidate('a')], preferences: [] as DietPref[], targets,
    meal: 'dinner' as const, planned: [], intake: null, isToday: true };
  const before = structuredClone(input);
  recommendMeals(input);
  assert.deepEqual(input, before);
});

test('real Buko library data supplies deterministic measured ideas, without padding sparse diet/meal results', () => {
  const candidates = STARTER_RECIPES.map((recipe): MealCandidate => {
    const draft = starterRecipeDraft(recipe);
    return { id: `library:${recipe.id}`, title: recipe.title, source: 'library',
      servings: draft.servings, ingredients: draft.ingredients, meal: recipe.meal.toLowerCase() as MealCandidate['meal'] };
  });
  for (const pref of ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'] as DietPref[]) {
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      const result = recommend({ candidates, preferences: [pref], meal });
      const available = candidates.filter((recipe) => recipe.meal === meal && !hasDietConflict(recipe, [pref])).length;
      assert.equal(result.recommendations.length, Math.min(3, available), `${pref}: ${meal}`);
      for (const idea of result.recommendations) {
        assert.equal(idea.candidate.meal, meal);
        assert.equal(hasDietConflict(idea.candidate, [pref]), false);
        assert.ok(Object.values(idea.macros).every((value) => value !== null && Number.isFinite(value)));
      }
      assert.deepEqual(result, recommend({ candidates: [...candidates].reverse(), preferences: [pref], meal }));
    }
  }
});
