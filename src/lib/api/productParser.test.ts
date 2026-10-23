import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseProduct } from './productParser';

it('shares salt and energy fallbacks for client and coach product scoring', () => {
  const product = parseProduct({
    code: '1234567890123', product_name: 'Beans', nutriments: { salt_100g: 1, energy_100g: 418.4 },
    additives_tags: ['en:e300'], allergens_tags: ['en:milk'],
  });
  assert.equal(product?.per100g.sodiumMg, 400);
  assert.ok(Math.abs(product!.per100g.calories! - 100) < 0.001);
  assert.deepEqual(product?.additives, [{ code: 'e300', name: 'E300' }]);
  assert.deepEqual(product?.allergens, ['milk']);
});

it('preserves explicit nutrients and handles missing or malformed public product fields', () => {
  const product = parseProduct({
    code: '1234567890123', product_name: 'Beans',
    nutriments: { sodium_100g: '0.2', salt_100g: 2, 'energy-kcal_100g': 0 },
    categories_tags: 'not an array', additives_tags: [null, 4, 'en:e300'],
  });
  assert.equal(product?.per100g.sodiumMg, 200);
  assert.equal(product?.per100g.calories, 0);
  assert.deepEqual(product?.categoryTags, []);
  assert.equal(parseProduct({ code: '123', product_name: '' }), null);
});
