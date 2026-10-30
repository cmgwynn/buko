import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Factor } from './scoring/factors.ts';
import type { Food, FoodLogEntry, Nutrients } from '../types/index.ts';
import { emptyMicronutrients } from './nutrition/micronutrients.ts';
import {
  amountToGrams, buildEntryInsert, completeMacrosForGrams, copyEntryRows, createLatestGate, foodFromEntry,
  incompleteNutritionMessage, mainScoreReasons, manualFormFromFood, matchesQuery, missingRequiredMacros,
  parseManualFood, planMealCopy, recentFoods, restoreEntryRow, servingOptions, sourcesForFilter, sumEntries,
} from './foodLogging.ts';

const per100 = (o: Partial<Nutrients>): Nutrients => ({
  calories: 200, protein: 10, carbs: 20, fat: 5, sugars: null, saturatedFat: null, sodiumMg: null, fiber: null, ...o,
});
const food = (o: Partial<Food> = {}): Food => ({
  source: 'off', sourceId: '123', name: 'Oats', brand: null, imageUrl: null, per100g: per100({}), servingG: null, servingLabel: null, ...o,
});
const entry = (o: Partial<FoodLogEntry> = {}): FoodLogEntry => ({
  id: 'e1', user_id: 'u', logged_on: '2026-10-22', meal: 'breakfast', source: 'usda', source_id: '1', name: 'Banana', brand: null,
  quantity: 120, unit: 'g', grams: 120, calories: 107, protein_g: 1.3, carbs_g: 27.4, fat_g: 0.4, created_at: '2026-10-22T08:00:00Z',
  health_external_id: 'hk-1', ...o,
});

test('missing macros are reported and never treated as zero', () => {
  const p = per100({ protein: null, fat: null });
  assert.deepEqual(missingRequiredMacros(p), ['protein', 'fat']);
  assert.match(incompleteNutritionMessage(p)!, /protein, fat/);
  assert.equal(completeMacrosForGrams(p, 100), null);
  assert.equal(incompleteNutritionMessage(per100({ protein: 0 })), null);
  const r = buildEntryInsert(food({ per100g: p }), { userId: 'u', date: '2026-10-23', meal: 'lunch', amount: '50', unit: 'g' });
  assert.ok('error' in r);
});

test('serving choice is offered only when the source gives a serving weight', () => {
  assert.deepEqual(servingOptions(food()).map((o) => o.unit), ['g']);
  const f = food({ servingG: 40, servingLabel: '1 cup (40 g)' });
  assert.deepEqual(servingOptions(f).map((o) => o.label), ['Servings (1 cup (40 g))', 'Grams']);
  assert.deepEqual(servingOptions(food({ servingG: 0 })).map((o) => o.unit), ['g']);
  assert.equal(amountToGrams('1,5', 'serving', f), 60);
  assert.equal(amountToGrams('1', 'serving', food()), null);
  assert.equal(amountToGrams('0', 'g', f), null);
  assert.equal(amountToGrams('6000', 'g', f), null);
  assert.equal(amountToGrams('', 'g', f), null);
});

test('builds an insert row from a complete food', () => {
  const r = buildEntryInsert(food({ servingG: 40, per100g: per100({ calciumMg: 100, vitaminDMcg: 2 }) }), { userId: 'u', date: '2026-10-23', meal: 'lunch', amount: '2', unit: 'serving' });
  assert.ok('row' in r);
  assert.equal(r.row.grams, 80);
  assert.equal(r.row.calories, 160);
  assert.equal(r.row.unit, 'serving');
  assert.equal(r.row.quantity, 2);
  assert.deepEqual(r.row.micronutrients, { ...emptyMicronutrients(), calciumMg: 80, vitaminDMcg: 1.6 });
});

test('foodFromEntry keeps the logged amount and only offers a serving it knows', () => {
  const g = foodFromEntry(entry())!;
  assert.equal(g.food.servingG, null);
  assert.deepEqual(g.last, { quantity: 120, unit: 'g' });
  assert.ok(Math.abs(g.food.per100g.calories! - 89.17) < 0.01);
  const s = foodFromEntry(entry({ unit: 'serving', quantity: 2, grams: 300 }))!;
  assert.equal(s.food.servingG, 150);
  assert.deepEqual(s.last, { quantity: 2, unit: 'serving' });
  assert.equal(foodFromEntry(entry({ grams: 0 })), null);
});

test('recentFoods de-duplicates by source and keeps the newest amount', () => {
  const list = recentFoods([entry({ id: 'a', grams: 150, quantity: 150 }), entry({ id: 'b' }), entry({ id: 'c', source_id: '2', name: 'Apple' })]);
  assert.equal(list.length, 2);
  assert.equal(list[0].lastGrams, 150);
  assert.equal(list[1].food.name, 'Apple');
});

test('copied rows keep the stored snapshot but not ids or health links', () => {
  const [row] = copyEntryRows([entry({ micronutrients: { ...emptyMicronutrients(), calciumMg: 35 } })], { userId: 'u2', date: '2026-10-23' });
  assert.equal(row.logged_on, '2026-10-23');
  assert.equal(row.user_id, 'u2');
  assert.equal(row.meal, 'breakfast');
  assert.equal(row.calories, 107);
  assert.equal(row.micronutrients.calciumMg, 35);
  assert.ok(!('id' in row) && !('health_external_id' in row) && !('created_at' in row));
  assert.equal(copyEntryRows([entry()], { userId: 'u', date: 'd', meal: 'snack' })[0].meal, 'snack');
});

test('sumEntries totals numeric strings from Postgres numerics', () => {
  const t = sumEntries([entry(), entry({ calories: '50' as unknown as number })]);
  assert.equal(t.calories, 157);
});

test('manual nutrition requires every macro and converts to per 100 g', () => {
  const base = { name: 'Bar', brand: '', basisGrams: '40', servingLabel: '1 bar', calories: '180', protein: '8', carbs: '20', fat: '7' };
  const ok = parseManualFood(base);
  assert.ok('food' in ok);
  assert.equal(ok.food.per100g.calories, 450);
  assert.equal(ok.food.per100g.calciumMg, null);
  assert.equal(ok.food.servingG, 40);
  assert.equal(ok.food.source, 'manual');
  const missing = parseManualFood({ ...base, fat: '' });
  assert.ok('errors' in missing && missing.errors.fat);
  const zero = parseManualFood({ ...base, fat: '0' });
  assert.ok('food' in zero);
  const tooMuch = parseManualFood({ ...base, protein: '30', carbs: '20' });
  assert.ok('errors' in tooMuch && tooMuch.errors.form);
  const kj = parseManualFood({ ...base, calories: '760' });
  assert.ok('errors' in kj && kj.errors.calories);
  const per100g = parseManualFood({ ...base, basisGrams: '100', servingLabel: '' });
  assert.ok('food' in per100g && per100g.food.servingG === null);
  const withCode = parseManualFood({ ...base, barcode: '0123 4567' });
  assert.ok('food' in withCode && withCode.food.sourceId === '01234567');
  const withMicros = parseManualFood({ ...base, calciumMg: '120', ironMg: '0.5', vitaminDMcg: '2' });
  assert.ok('food' in withMicros);
  assert.equal(withMicros.food.per100g.calciumMg, 300);
  assert.equal(withMicros.food.per100g.ironMg, 1.25);
  assert.equal(withMicros.food.per100g.vitaminDMcg, 5);
  const invalidMicro = parseManualFood({ ...base, potassiumMg: '-1' });
  assert.ok('errors' in invalidMicro && invalidMicro.errors.potassiumMg);
});

test('manual form prefill leaves unknown values blank', () => {
  const f = manualFormFromFood(food({ per100g: per100({ protein: null }) }), '999');
  assert.equal(f.protein, '');
  assert.equal(f.calories, '200');
  assert.equal(f.barcode, '999');
});

test('search helpers', () => {
  assert.ok(matchesQuery('Greek Yogurt, Plain', 'plain greek'));
  assert.ok(!matchesQuery('Greek Yogurt', 'vanilla'));
  assert.deepEqual(sourcesForFilter('recent'), { whole: false, packaged: false });
  assert.deepEqual(sourcesForFilter('packaged'), { whole: false, packaged: true });
  assert.deepEqual(sourcesForFilter('all'), { whole: true, packaged: true });
  const gate = createLatestGate();
  const a = gate.start();
  const b = gate.start();
  assert.ok(!gate.isLatest(a) && gate.isLatest(b));
  gate.cancel();
  assert.ok(!gate.isLatest(b));
});

test('mainScoreReasons picks the strongest known factors', () => {
  const f = (id: string, points: number | null, weight: number) => ({ id, label: id, weight, points, value: '', explanation: '', source: { name: '', url: '' } }) as unknown as Factor;
  const r = mainScoreReasons([f('a', 50, 30), f('b', 10, 20), f('c', null, 40), f('d', 95, 10), f('e', 70, 10)], 2);
  assert.deepEqual(r.map((x) => x.id), ['b', 'd']);
});

test('restoreEntryRow rebuilds only the owner\'s snapshot and drops the health link', () => {
  const e = entry({ user_id: 'u1', meal: 'dinner', quantity: 2, unit: 'serving' });
  const row = restoreEntryRow(e, 'u1')!;
  assert.equal(row.logged_on, '2026-10-22');
  assert.equal(row.meal, 'dinner');
  assert.equal(row.unit, 'serving');
  assert.equal(row.quantity, 2);
  assert.equal(row.created_at, e.created_at);
  assert.ok(!('id' in row) && !('health_external_id' in row));
  assert.equal(restoreEntryRow(e, 'someone-else'), null);
  assert.equal(restoreEntryRow(e, ''), null);
});

test('planMealCopy skips items already in the meal but keeps genuine repeats', () => {
  const egg = entry({ id: 's1', source_id: 'egg', name: 'Egg', grams: 50 });
  const egg2 = entry({ id: 's2', source_id: 'egg', name: 'Egg', grams: 50 });
  const toast = entry({ id: 's3', source_id: 'toast', name: 'Toast', grams: 30 });
  const already = [entry({ id: 't1', source_id: 'egg', name: 'Egg', grams: 50 })];
  const plan = planMealCopy([egg, egg2, toast], already);
  assert.deepEqual(plan.duplicates.map((e) => e.id), ['s1']);
  assert.deepEqual(plan.toAdd.map((e) => e.id), ['s2', 's3']);
  const differentAmount = planMealCopy([egg], [entry({ source_id: 'egg', name: 'Egg', grams: 100 })]);
  assert.equal(differentAmount.toAdd.length, 1);
  assert.deepEqual(planMealCopy([egg, toast], []).toAdd.length, 2);
});
