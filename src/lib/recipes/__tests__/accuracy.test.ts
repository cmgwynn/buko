import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIngredient } from '../ingredientParser';
import { estimateGrams } from '../units';

test('package sizes in parentheses multiply out', () => {
  const p = parseIngredient('1 (8 ounce) package rice vermicelli noodles');
  assert.equal(p.quantity, 1);
  assert.equal(p.unit, 'package');
  assert.ok(Math.abs(p.sizeGrams! - 226.8) < 0.1);
  assert.equal(p.name, 'rice vermicelli noodles');
});

test('hyphenated package size', () => {
  const p = parseIngredient('1 22-ounce bag frozen waffle fries');
  assert.equal(p.quantity, 1);
  assert.equal(p.unit, 'bag');
  assert.ok(Math.abs(p.sizeGrams! - 623.7) < 0.1);
  assert.equal(p.name, 'frozen waffle fries');
});

test('container first, size in parentheses', () => {
  const p = parseIngredient('2 cans (14 oz) diced tomatoes');
  assert.equal(p.quantity, 2);
  assert.equal(p.unit, 'can');
  assert.ok(Math.abs(p.sizeGrams! - 396.9) < 0.1);
  assert.equal(p.name, 'diced tomatoes');
});

test('plain ingredients are unchanged', () => {
  const p = parseIngredient('2 cups flour');
  assert.deepEqual([p.quantity, p.unit, p.name], [2, 'cup', 'flour']);
});

test('light foods are not weighed like water', () => {
  assert.ok((estimateGrams(3, 'tbsp', 'chopped cilantro') ?? 99) < 8);
  assert.ok((estimateGrams(1, 'cup', 'chopped lettuce') ?? 999) < 60);
  assert.ok((estimateGrams(8, null, 'medium shrimp') ?? 0) > 50);
});
