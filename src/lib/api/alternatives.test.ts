import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalCategoryTag } from './alternatives';

test('raw Open Food Facts category names become searchable canonical tags', () => {
  assert.equal(canonicalCategoryTag('en:Rice Noodles'), 'en:rice-noodles');
  assert.equal(canonicalCategoryTag('en:noodles'), 'en:noodles');
});
