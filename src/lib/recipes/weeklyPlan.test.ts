import assert from 'node:assert/strict';
import test from 'node:test';
import { foodExcluded, generateWeeklyMealPlan, mealPlanSnapshot, mealSlotKey, type WeeklyEntry } from './weeklyPlan.ts';
import type { MealCandidate } from './recommendations.ts';
import { STARTER_RECIPES, starterRecipeDraft } from './library.ts';

const bowl = (id: string, name = 'rice'): MealCandidate => ({
  id, title: id, source: 'saved', servings: 1, ingredients: [{ name, grams: 100,
    nutrition: { per100g: { calories: 500, protein: 25, carbs: 60, fat: 10, fiber: null, sugars: null, sodiumMg: null, saturatedFat: null } } }],
});
const entry: WeeklyEntry = { id: 'existing', date: '2026-10-26', meal: 'dinner', recipeId: 'old', servings: 2, logged: false };
const base = {
  weekStart: '2026-10-26', dates: ['2026-10-26', '2026-10-27'], meals: ['dinner' as const],
  replaceSlots: [], entries: [] as WeeklyEntry[], candidates: [bowl('a'), bowl('b'), bowl('c')],
  preferences: [], foodExclusions: [], targets: { calories: 2000, protein_g: 100, carbs_g: 240, fat_g: 40 },
  today: '2026-10-26', intake: null,
};

test('weekly preview selects only requested in-week days/meals and is deterministic across ordering', () => {
  const result = generateWeeklyMealPlan({ ...base, dates: [...base.dates, '2026-11-02'] });
  assert.equal(result.additions, 2);
  assert.deepEqual(result.slots.map((slot) => [slot.date, slot.meal]), [['2026-10-26', 'dinner'], ['2026-10-27', 'dinner']]);
  assert.notEqual(result.slots[0].candidate?.id, result.slots[1].candidate?.id);
  assert.deepEqual(result, generateWeeklyMealPlan({ ...base, candidates: [...base.candidates].reverse(), dates: [...base.dates].reverse() }));
});

test('occupied slots are preserved unless individually selected; logged slots are never replaced', () => {
  const untouched = generateWeeklyMealPlan({ ...base, entries: [entry] });
  assert.equal(untouched.slots[0].candidate, null);
  assert.deepEqual(untouched.replaceIds, []);
  const replace = generateWeeklyMealPlan({ ...base, entries: [entry], replaceSlots: [mealSlotKey(entry.date, entry.meal)] });
  assert.deepEqual(replace.replaceIds, ['existing']);
  const logged = generateWeeklyMealPlan({ ...base, entries: [{ ...entry, logged: true }], replaceSlots: [mealSlotKey(entry.date, entry.meal)] });
  assert.equal(logged.slots[0].candidate, null);
  assert.deepEqual(logged.replaceIds, []);
});

test('selected replacements outside chosen days/meals do not affect preserved meals', () => {
  const result = generateWeeklyMealPlan({ ...base, dates: ['2026-10-27'], entries: [entry], replaceSlots: [mealSlotKey(entry.date, entry.meal)] });
  assert.deepEqual(result.replaceIds, []);
  assert.equal(result.additions, 1);
});

test('account food exclusions match normalized ingredient/title phrases, not substrings', () => {
  assert.equal(foodExcluded(bowl('bowl', 'Peanut-butter sauce'), [' peanut butter ']), true);
  assert.equal(foodExcluded(bowl('herbal salad', 'chamomile'), ['ham']), false);
  assert.equal(foodExcluded(bowl('ham salad', 'chamomile'), ['ham']), true);
  assert.equal(foodExcluded(bowl('rice'), ['']), false);
  const result = generateWeeklyMealPlan({ ...base, candidates: [bowl('a', 'peanut butter'), bowl('b', 'chicken'), bowl('c')],
    preferences: ['vegan'], foodExclusions: ['peanut butter'] });
  assert.equal(result.slots[0].candidate?.id, 'c');
});

test('no eligible recipe leaves selected replacement intact and reports an unfilled slot', () => {
  const result = generateWeeklyMealPlan({ ...base, entries: [entry], candidates: [],
    replaceSlots: [mealSlotKey(entry.date, entry.meal)] });
  assert.equal(result.additions, 0);
  assert.deepEqual(result.replaceIds, []);
  assert.match(result.slots[0].reason, /stay unchanged/);
  assert.equal(result.dailyTotals[0].totals.calories, null);
});

test('preview totals include preserved portions and additions, not removed entries', () => {
  const existing = { ...entry, recipeId: 'a', meal: 'lunch' as const };
  const result = generateWeeklyMealPlan({ ...base, entries: [existing] });
  assert.equal(result.dailyTotals[0].totals.calories, 1500);
  const replaced = generateWeeklyMealPlan({ ...base, entries: [{ ...entry, recipeId: 'a' }],
    replaceSlots: [mealSlotKey(entry.date, entry.meal)] });
  assert.equal(replaced.dailyTotals[0].totals.calories, 500);
});

test('unknown nutrient remains unknown in totals, never a zero subtotal', () => {
  const missing = { ...bowl('missing'), ingredients: [{ name: 'sauce', grams: null, nutrition: null }] };
  const result = generateWeeklyMealPlan({ ...base, candidates: [missing] });
  assert.equal(result.slots[0].macros?.calories, null);
  assert.equal(result.dailyTotals[0].totals.calories, null);
});

test('intake influences only today and logged plans are not counted twice', () => {
  const scaled = (id: string, grams: number) => ({ ...bowl(id), ingredients: [{ ...bowl(id).ingredients[0], grams }] });
  const result = generateWeeklyMealPlan({ ...base, candidates: [scaled('small', 20), scaled('large', 140)],
    intake: { calories: 1800, protein_g: 90, carbs_g: 200, fat_g: 30 } });
  assert.match(result.slots[0].reason, /intake/);
  assert.match(result.slots[1].reason, /planned meals only/);
  assert.equal(result.slots[0].candidate?.id, 'small');
  assert.equal(result.slots[1].candidate?.id, 'large');
});

test('preserved excluded recipes still reserve their reported nutrients rather than becoming unknown', () => {
  const result = generateWeeklyMealPlan({ ...base,
    entries: [{ ...entry, recipeId: 'old', meal: 'lunch' }], candidates: [bowl('old', 'peanuts'), bowl('new')],
    foodExclusions: ['peanuts'],
  });
  assert.equal(result.slots[0].candidate?.id, 'new');
  assert.doesNotMatch(result.slots[0].reason, /planned nutrition unknown/);
  assert.equal(result.dailyTotals[0].totals.calories, 1500);
});

test('preview signatures detect edits, deletions, additions and logged state independent of ordering', () => {
  const second = { ...entry, id: 'second', meal: 'lunch' as const };
  assert.equal(mealPlanSnapshot([entry, second]), mealPlanSnapshot([second, entry]));
  for (const changed of [[], [entry, second], [{ ...entry, servings: 1 }], [{ ...entry, logged: true }]]) {
    assert.notEqual(mealPlanSnapshot([entry]), mealPlanSnapshot(changed));
  }
});

test('generating never mutates candidates, selections or existing entries; empty selection adds nothing', () => {
  const input = { ...base, entries: [entry] };
  const before = structuredClone(input);
  generateWeeklyMealPlan(input);
  assert.deepEqual(input, before);
  assert.equal(generateWeeklyMealPlan({ ...base, meals: [] }).additions, 0);
  assert.equal(generateWeeklyMealPlan({ ...base, dates: [] }).additions, 0);
});

test('real library generates a complete 21-meal week from measured snapshots, with account exclusions', () => {
  const candidates = STARTER_RECIPES.map((recipe): MealCandidate => {
    const draft = starterRecipeDraft(recipe);
    return { id: recipe.id, title: recipe.title, source: 'library', servings: draft.servings,
      ingredients: draft.ingredients, meal: recipe.meal.toLowerCase() as MealCandidate['meal'] };
  });
  const input = { ...base, candidates, dates: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    meals: ['breakfast', 'lunch', 'dinner'] as const, foodExclusions: ['chicken', 'peanut butter'] };
  const result = generateWeeklyMealPlan(input);
  assert.equal(result.additions, 21);
  assert.equal(result.dailyTotals.length, 7);
  for (const slot of result.slots) {
    assert.ok(slot.candidate);
    assert.equal(foodExcluded(slot.candidate, input.foodExclusions), false);
    assert.ok(Object.values(slot.macros!).every((value) => value !== null && Number.isFinite(value)));
  }
  assert.equal(new Set(result.slots.map((slot) => slot.candidate!.id)).size, 21);
});

test('swapping one slot changes only that recipe and cycles back once every option is swapped', () => {
  const first = generateWeeklyMealPlan(base);
  const key = mealSlotKey('2026-10-26', 'dinner');
  const original = first.slots[0].candidate!.id;
  const swapped = generateWeeklyMealPlan({ ...base, swappedOut: { [key]: [original] } });
  assert.notEqual(swapped.slots[0].candidate?.id, original);
  assert.equal(swapped.additions, first.additions);
  const all = generateWeeklyMealPlan({ ...base, swappedOut: { [key]: ['a', 'b', 'c'] } });
  assert.ok(all.slots[0].candidate);
});
