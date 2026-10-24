import { describe, expect, test } from '@jest/globals';
import { buildGroceryList } from './grocery';

describe('grocery list generation', () => {
  test('merges equivalent mass units, scales planned servings, and formats the result', () => {
    const list = buildGroceryList([
      {
        title: 'Bread',
        servings: 2,
        plannedServings: 4,
        ingredients: [{ name: 'Flour', quantity: 500, unit: 'g' }],
      },
      {
        title: 'Pancakes',
        servings: 4,
        plannedServings: 4,
        ingredients: [{ name: 'flour', quantity: 0.5, unit: 'kg' }],
      },
    ], [], 'metric');

    expect(list).toEqual([
      expect.objectContaining({
        name: 'Flour',
        dim: 'mass',
        amount: 1500,
        baseUnit: 'g',
        display: '1.5 kg',
        fromRecipes: ['Bread', 'Pancakes'],
      }),
    ]);
  });

  test('subtracts pantry stock converted to the same base unit', () => {
    const list = buildGroceryList([
      {
        title: 'Soup',
        servings: 1,
        plannedServings: 1,
        ingredients: [{ name: 'Beans', quantity: 1000, unit: 'g' }],
      },
    ], [{
      id: 'pantry-beans',
      user_id: 'user',
      name: 'Beans',
      canonical_name: 'bean',
      quantity: 0.25,
      unit: 'kg',
      section: 'pantry',
      updated_at: '',
    }], 'metric');

    expect(list[0]).toEqual(expect.objectContaining({
      amount: 750,
      display: '750 g',
    }));
  });
});
