import assert from 'node:assert/strict';
import { it } from 'node:test';
import { parseProduct } from './productParser';
import { parseUsdaFood } from './usda';

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

  it('reads supported micronutrients from public food and USDA snapshots without defaulting missing values', () => {
    const product = parseProduct({
      code: '1234567890123', product_name: 'Fortified milk',
      nutriments: { calcium_100g: 120, iron_100g: 0.1, potassium_100g: 150, 'vitamin-c_100g': 1.2, 'vitamin-d_100g': 2 },
    });
    assert.deepEqual([
      product?.per100g.calciumMg, product?.per100g.ironMg, product?.per100g.potassiumMg,
      product?.per100g.vitaminCMg, product?.per100g.vitaminDMcg,
    ], [120, 0.1, 150, 1.2, 2]);
    const whole = parseUsdaFood({
      fdcId: 1, description: 'MILK', foodNutrients: [
        { nutrientNumber: '301', value: 120 }, { nutrientNumber: '303', value: 0.1 },
        { nutrientNumber: '306', value: 150 }, { nutrientNumber: '401', value: 1.2 }, { nutrientNumber: '328', value: 2 },
      ],
    });
    assert.deepEqual([
      whole.per100g.calciumMg, whole.per100g.ironMg, whole.per100g.potassiumMg,
      whole.per100g.vitaminCMg, whole.per100g.vitaminDMcg,
    ], [120, 0.1, 150, 1.2, 2]);
    assert.equal(parseUsdaFood({ fdcId: 2, description: 'Rice' }).per100g.calciumMg, null);
  });
  assert.equal(product?.per100g.sodiumMg, 200);
  assert.equal(product?.per100g.calories, 0);
  assert.deepEqual(product?.categoryTags, []);
  assert.equal(parseProduct({ code: '123', product_name: '' }), null);
});
