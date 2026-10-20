import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeNutriScore, gradeForScore } from '../../scoring/nutriscore';
import { buildGroceryList } from '../grocery';
import { parseIngredient } from '../ingredientParser';
import { computeRecipeNutrition, scoreRecipe } from '../nutrition';
import { extractRecipeFromHtml, parseDurationMinutes } from '../schemaOrg';
import { canonicalName, sectionFor } from '../sections';
import { detectTimerSeconds, formatClock } from '../timers';
import { displayAmount, estimateGrams, formatQuantity, scaleQuantity } from '../units';
import type { PantryItem } from '../types';

describe('ingredient parser', () => {
  it('parses simple, mixed, unicode and range quantities', () => {
    assert.deepEqual(pick(parseIngredient('2 cups flour')), { quantity: 2, unit: 'cup', name: 'flour' });
    assert.deepEqual(pick(parseIngredient('1 1/2 tsp salt')), { quantity: 1.5, unit: 'tsp', name: 'salt' });
    assert.deepEqual(pick(parseIngredient('1½ cups milk')), { quantity: 1.5, unit: 'cup', name: 'milk' });
    assert.deepEqual(pick(parseIngredient('½ onion, finely chopped')), { quantity: 0.5, unit: null, name: 'onion' });
    assert.deepEqual(pick(parseIngredient('2-3 cloves garlic')), { quantity: 3, unit: 'clove', name: 'garlic' });
    assert.deepEqual(pick(parseIngredient('1 (14 oz) can chickpeas, drained')), { quantity: 1, unit: 'can', name: 'chickpeas' });
  });
  it('keeps unmeasured ingredients', () => {
    assert.deepEqual(pick(parseIngredient('Salt, to taste')), { quantity: null, unit: null, name: 'Salt' });
  });
});
const pick = (p: { quantity: number | null; unit: string | null; name: string }) => ({ quantity: p.quantity, unit: p.unit, name: p.name });

describe('units', () => {
  it('estimates grams', () => {
    assert.equal(estimateGrams(2, 'oz', 'cheese') && Math.round(estimateGrams(2, 'oz', 'cheese')!), 57);
    assert.equal(Math.round(estimateGrams(1, 'cup', 'flour')!), 125);
    assert.equal(estimateGrams(3, 'clove', 'garlic'), 9);
    assert.equal(estimateGrams(2, null, 'eggs'), 100);
    assert.equal(estimateGrams(1, null, 'mystery'), null);
  });
  it('scales and formats', () => {
    assert.equal(scaleQuantity(2, 4, 6), 3);
    assert.equal(formatQuantity(1.5), '1½');
    assert.equal(formatQuantity(0.33), '⅓');
    assert.equal(formatQuantity(12.4), '12');
  });
  it('picks friendly display units', () => {
    assert.equal(displayAmount('mass', 1500, '', 'metric').text, '1.5 kg');
    assert.equal(displayAmount('volume', 473, '', 'imperial').text, '2 cups');
    assert.equal(displayAmount('count', 3, 'clove', 'metric').text, '3 cloves');
  });
});

describe('schema.org import', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'x' },
      {
        '@type': 'Recipe', name: 'Pancakes &amp; Syrup', description: 'LONG STORY', image: 'x.jpg',
        recipeYield: ['4', '4 servings'], prepTime: 'PT10M', cookTime: 'PT1H30M',
        recipeIngredient: ['1 cup flour', '2 eggs'],
        recipeInstructions: [{ '@type': 'HowToStep', text: 'Mix.' }, { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Fry 3 minutes.' }] }],
      },
    ],
  })}</script></head></html>`;
  it('extracts only the structured fields', () => {
    const r = extractRecipeFromHtml(html, 'https://www.example.com/p')!;
    assert.equal(r.title, 'Pancakes & Syrup');
    assert.equal(r.servings, 4);
    assert.equal(r.prepMinutes, 10);
    assert.equal(r.cookMinutes, 90);
    assert.deepEqual(r.steps, ['Mix.', 'Fry 3 minutes.']);
    assert.equal(r.sourceName, 'example.com');
    assert.ok(!JSON.stringify(r).includes('LONG STORY'));
  });
  it('returns null without recipe data', () => {
    assert.equal(extractRecipeFromHtml('<html></html>', 'https://a.com'), null);
    assert.equal(parseDurationMinutes('nonsense'), null);
  });
});

describe('timers', () => {
  it('detects durations', () => {
    assert.equal(detectTimerSeconds('Simmer for 10-15 minutes.'), 900);
    assert.equal(detectTimerSeconds('Bake 1 hour'), 3600);
    assert.equal(detectTimerSeconds('Stir well.'), null);
    assert.equal(formatClock(75), '1:15');
    assert.equal(formatClock(3725), '1:02:05');
  });
});

describe('nutri-score', () => {
  const n = (o: Partial<Record<string, number>>) => ({ calories: 0, protein: 0, carbs: 0, fat: 0, sugars: 0, saturatedFat: 0, sodiumMg: 0, fiber: 0, ...o });
  it('maps grades', () => {
    assert.equal(gradeForScore(0), 'a');
    assert.equal(gradeForScore(2), 'b');
    assert.equal(gradeForScore(10), 'c');
    assert.equal(gradeForScore(18), 'd');
    assert.equal(gradeForScore(19), 'e');
  });
  it('matches a hand-computed value (Nutella: 31 / E)', () => {
    const r = computeNutriScore(n({ calories: 539, protein: 6.3, sugars: 56.3, saturatedFat: 10.6, sodiumMg: 41.2, fiber: 0 }) as never, 0)!;
    assert.equal(r.score, 31);
    assert.equal(r.grade, 'e');
  });
  it('returns null when required nutrients are missing', () => {
    assert.equal(computeNutriScore({ ...n({}), sugars: null } as never, 0), null);
  });
});

describe('recipe nutrition and score', () => {
  const veg = { per100g: n100({ calories: 30, protein: 2, carbs: 5, fat: 0.3, sugars: 2, saturatedFat: 0.05, sodiumMg: 20, fiber: 3 }), category: 'Vegetables and Vegetable Products' };
  it('sums per serving and scores', () => {
    const nut = computeRecipeNutrition([{ grams: 400, nutrition: veg }, { grams: null, nutrition: veg }], 2);
    assert.equal(Math.round(nut.perServing.calories), 60);
    assert.equal(nut.excluded, 1);
    assert.equal(nut.fvlPercent, 100);
    const s = scoreRecipe('Veg', nut);
    assert.ok(s.score !== null && s.score >= 75);
    assert.equal(s.factors.find((f) => f.id === 'additives')!.points, null);
  });
});
function n100(o: Record<string, number>) {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, sugars: 0, saturatedFat: 0, sodiumMg: 0, fiber: 0, ...o };
}

describe('grocery generation', () => {
  const pantry = (name: string, quantity: number | null, unit: string | null): PantryItem => ({
    id: name, user_id: 'u', name, canonical_name: canonicalName(name), quantity, unit, section: 'pantry', updated_at: '',
  });
  const recipes = [
    { title: 'A', servings: 2, plannedServings: 4, ingredients: [{ name: 'onions', quantity: 1, unit: null }, { name: 'flour', quantity: 1, unit: 'cup' }, { name: 'salt', quantity: null, unit: null }] },
    { title: 'B', servings: 4, plannedServings: 4, ingredients: [{ name: 'onion', quantity: 2, unit: null }, { name: 'flour', quantity: 250, unit: 'g' }, { name: 'chicken breast', quantity: 1, unit: 'lb' }] },
  ];
  it('merges duplicates within a dimension and scales servings', () => {
    const list = buildGroceryList(recipes, [], 'metric');
    const onion = list.find((i) => i.name.toLowerCase().startsWith('onion'))!;
    assert.equal(onion.amount, 4); // 1×2 + 2
    assert.deepEqual(onion.fromRecipes.sort(), ['A', 'B']);
    // flour by volume and by weight stay separate rather than being guessed together
    assert.equal(list.filter((i) => i.name === 'Flour').length, 2);
  });
  it('subtracts pantry and groups by section', () => {
    const list = buildGroceryList(recipes, [pantry('Onion', null, null), pantry('Flour', 100, 'g'), pantry('Salt', null, null)], 'metric');
    assert.ok(!list.some((i) => /onion|salt/i.test(i.name)));
    const flourG = list.find((i) => i.name === 'Flour' && i.dim === 'mass')!;
    assert.equal(flourG.amount, 150);
    assert.equal(list.find((i) => /chicken/i.test(i.name))!.section, 'meat');
    assert.equal(sectionFor('canned tomatoes'), 'pantry');
    assert.equal(sectionFor('spinach'), 'produce');
    assert.equal(sectionFor('milk'), 'dairy');
    assert.equal(sectionFor('frozen peas'), 'frozen');
  });
});
