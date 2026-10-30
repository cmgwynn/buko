import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Product } from '../../../types';
import { pickAlternatives, scoreProduct } from '../index';

const base: Product = {
  source: 'off', sourceId: '1', barcode: '1', name: 'Test', brand: null, imageUrl: null,
  servingG: null, servingLabel: null, categoryTags: [], nutriscoreGrade: null, novaGroup: null,
  additives: [], allergens: [], ingredientsAnalysis: [],
  per100g: { calories: 100, protein: 1, carbs: 10, fat: 1, sugars: null, saturatedFat: null, sodiumMg: null, fiber: null },
};
const make = (o: Partial<Product>): Product => ({ ...base, ...o, per100g: { ...base.per100g, ...(o.per100g ?? {}) } });

test('best-case product scores 100', () => {
  const r = scoreProduct(make({ nutriscoreGrade: 'a', novaGroup: 1, per100g: { ...base.per100g, sugars: 1, sodiumMg: 10, saturatedFat: 0.5 } }));
  assert.equal(r.score, 100);
  assert.equal(r.rating, 'excellent');
});

test('worst-case product scores 0 and is poor', () => {
  const additives = [{ code: 'e171', name: 'x' }, { code: 'e102', name: 'y' }, { code: 'e250', name: 'z' }];
  const r = scoreProduct(make({ nutriscoreGrade: 'e', novaGroup: 4, additives, per100g: { ...base.per100g, sugars: 50, sodiumMg: 2000, saturatedFat: 20 } }));
  assert.equal(r.score, 0);
  assert.equal(r.rating, 'poor');
});

test('missing factors are redistributed, not counted as zero', () => {
  const r = scoreProduct(make({ nutriscoreGrade: 'a', novaGroup: 1 }));
  assert.equal(r.score, 100);
  assert.ok(r.confidence < 1);
});

test('refuses to score with too little data', () => {
  // NOVA (20) + additives (15) = 35 < 40
  const r = scoreProduct(make({ novaGroup: 1 }));
  assert.equal(r.score, null);
  assert.equal(r.rating, 'unknown');
});

test('every factor names a source and an explanation', () => {
  for (const f of scoreProduct(make({ nutriscoreGrade: 'c', novaGroup: 3 })).factors) {
    assert.ok(f.source.name && f.source.url.startsWith('http'));
    assert.ok(f.explanation.length > 10);
  }
});

test('alternatives must be meaningfully better and are sorted', () => {
  const cur = scoreProduct(make({ nutriscoreGrade: 'd', novaGroup: 4 }));
  const alts = pickAlternatives(cur, [
    make({ barcode: 'a', nutriscoreGrade: 'a', novaGroup: 1 }),
    make({ barcode: 'b', nutriscoreGrade: 'd', novaGroup: 4 }),
    make({ barcode: 'c', nutriscoreGrade: 'b', novaGroup: 3 }),
  ]);
  assert.deepEqual(alts.map((a) => a.product.barcode), ['a', 'c']);
});

test('missing Nutri-Score is estimated from complete label nutrition', () => {
  // Nutella-like: very sweet, high saturated fat, no official grade.
  const spread = make({ novaGroup: 3, per100g: { calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugars: 56.3, saturatedFat: 10.6, sodiumMg: 43, fiber: 0 } });
  const factor = scoreProduct(spread).factors.find((f) => f.id === 'nutriscore')!;
  assert.equal(factor.points, 0);
  assert.match(factor.value, /Grade E \(estimated\)/);
  assert.ok(scoreProduct(spread).score! < 50);
});

test('Nutri-Score is not estimated for drinks or when nutrition is incomplete', () => {
  const full = { calories: 42, protein: 0, carbs: 10.6, fat: 0, sugars: 10.6, saturatedFat: 0, sodiumMg: 4, fiber: 0 };
  const soda = make({ categoryTags: ['en:beverages'], per100g: full });
  assert.equal(scoreProduct(soda).factors.find((f) => f.id === 'nutriscore')!.points, null);
  assert.equal(scoreProduct(make({})).factors.find((f) => f.id === 'nutriscore')!.points, null);
});
