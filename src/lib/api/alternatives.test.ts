import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alternativeSearchTags, canonicalCategoryTag } from './alternatives';

test('raw Open Food Facts category names become searchable canonical tags', () => {
  assert.equal(canonicalCategoryTag('en:Rice Noodles'), 'en:rice-noodles');
  assert.equal(canonicalCategoryTag('en:noodles'), 'en:noodles');
});

test('alternative search prefers specific taxonomy categories over free-text tags', () => {
  const tags = ['en:breakfasts', 'en:spreads', 'en:sweet-spreads', 'en:cocoa-and-its-products', 'en:cocoa-powders', 'en:confectionary-based-spreads', 'en:Pâtes à tartiner', 'fr:Nutella', 'fr:Nuttela'];
  assert.deepEqual(alternativeSearchTags(tags), ['en:confectionary-based-spreads', 'en:sweet-spreads', 'en:spreads']);
  assert.deepEqual(alternativeSearchTags(['fr:Nutella']), ['fr:nutella']);
  assert.deepEqual(alternativeSearchTags(['en:noodles', 'en:soups', 'en:rice-noodles']), ['en:rice-noodles', 'en:noodles', 'en:soups']);
});
