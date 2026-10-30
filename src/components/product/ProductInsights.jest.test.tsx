import { expect, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { scoreProduct } from '../../lib/scoring';
import type { Product } from '../../types';
import { FactorSection, NutritionFacts, factorVerdict, splitFactors } from './ProductInsights';

const spread: Product = {
  source: 'off', sourceId: '1', barcode: '1', name: 'Spread', brand: null, imageUrl: null,
  servingG: 15, servingLabel: '15 g', categoryTags: [], nutriscoreGrade: null, novaGroup: 3,
  additives: [], allergens: [], ingredientsAnalysis: [],
  per100g: { calories: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugars: 56.3, saturatedFat: 10.6, sodiumMg: 43, fiber: 0 },
};

test('factors split into negatives and positives with plain verdicts', () => {
  const { factors } = scoreProduct(spread);
  const { negatives, positives, missing } = splitFactors(factors);
  expect(negatives.map(factorVerdict)).toEqual(expect.arrayContaining(['Very poor nutrition profile', 'Too sweet']));
  expect(positives.map(factorVerdict)).toEqual(expect.arrayContaining(['No additives', 'Low salt']));
  expect(missing).toHaveLength(0);
});

test('a factor row expands to show its explanation and weight', async () => {
  const { factors } = scoreProduct(spread);
  const { negatives } = splitFactors(factors);
  await render(<FactorSection title="Negatives" tone="negative" factors={negatives} totalWeight={100} />);
  expect(screen.queryByText(/% of the score/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /^Sugar: Too sweet/ }));
  expect(screen.getByText(/10% of the score/)).toBeTruthy();
});

test('nutrition facts switch between per 100 g and per serving', async () => {
  await render(<NutritionFacts per100g={spread.per100g} servingG={15} servingLabel="15 g" factors={scoreProduct(spread).factors} />);
  expect(screen.getByText('539 kcal')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: /Per serving/ }));
  expect(screen.getByText('81 kcal')).toBeTruthy();
  expect(screen.getByText('8.4 g')).toBeTruthy();
});
