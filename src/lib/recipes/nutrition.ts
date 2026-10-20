import type { Nutrients, Product } from '../../types';
import { macrosForGrams, type Macros } from '../diary';
import { computeNutriScore, type NutriScoreResult } from '../scoring/nutriscore';
import { scoreProduct, type ScoreResult } from '../scoring';
import type { RecipeIngredient } from './types';

type NutrIngredient = Pick<RecipeIngredient, 'grams' | 'nutrition'>;

/** USDA food categories counted as "fruit, vegetables, legumes, nuts" for Nutri-Score. */
const FVLN_CATEGORY = /^(vegetables|fruits|legumes|nut and seed)/i;

export interface RecipeNutrition {
  totalGrams: number;
  /** Totals for the whole recipe, summed over ingredients that have a weight and nutrition data. */
  total: Macros;
  perServing: Macros;
  perServingGrams: number;
  per100g: Nutrients;
  fvlPercent: number;
  nutriScore: NutriScoreResult | null;
  /** Ingredients left out of the maths because they have no weight or no nutrition match. */
  excluded: number;
  counted: number;
}

const KEYS: (keyof Nutrients)[] = ['calories', 'protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'sodiumMg', 'fiber'];

export function computeRecipeNutrition(ingredients: NutrIngredient[], servings: number): RecipeNutrition {
  const sums: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let totalGrams = 0;
  let fvlGrams = 0;
  let counted = 0;
  let excluded = 0;

  for (const ing of ingredients) {
    if (!ing.grams || ing.grams <= 0 || !ing.nutrition) {
      excluded++;
      continue;
    }
    counted++;
    totalGrams += ing.grams;
    const per100 = ing.nutrition.per100g;
    // Missing nutrients are treated as 0 for the sum; the Nutri-Score check below needs the core ones present.
    for (const k of KEYS) sums[k] += ((per100[k] ?? 0) * ing.grams) / 100;
    if (FVLN_CATEGORY.test(ing.nutrition.category ?? '')) fvlGrams += ing.grams;
  }

  const safeServings = servings > 0 ? servings : 1;
  const per100g = Object.fromEntries(KEYS.map((k) => [k, totalGrams > 0 ? (sums[k] / totalGrams) * 100 : null])) as unknown as Nutrients;
  const total = macrosForGrams(per100g, totalGrams);
  const perServing: Macros = {
    calories: total.calories / safeServings,
    protein_g: total.protein_g / safeServings,
    carbs_g: total.carbs_g / safeServings,
    fat_g: total.fat_g / safeServings,
  };
  const fvlPercent = totalGrams > 0 ? (fvlGrams / totalGrams) * 100 : 0;
  return {
    totalGrams,
    total,
    perServing,
    perServingGrams: totalGrams / safeServings,
    per100g,
    fvlPercent,
    nutriScore: totalGrams > 0 ? computeNutriScore(per100g, fvlPercent) : null,
    excluded,
    counted,
  };
}

/**
 * Score a recipe with the same module used for packaged products. The recipe becomes a synthetic
 * product: its Nutri-Score is computed from the ingredient totals, NOVA is unknown (generic
 * ingredients have no processing group) and additives are unknown, so those factors are skipped
 * and the remaining factors are re-weighted by the scoring module.
 */
export function scoreRecipe(title: string, nutrition: RecipeNutrition): ScoreResult {
  const product: Product = {
    source: 'recipe',
    sourceId: 'recipe',
    name: title,
    brand: null,
    imageUrl: null,
    per100g: nutrition.per100g,
    servingG: nutrition.perServingGrams,
    servingLabel: null,
    barcode: '',
    categoryTags: [],
    nutriscoreGrade: nutrition.nutriScore?.grade ?? null,
    novaGroup: null,
    additives: [],
    additivesUnknown: true,
    allergens: [],
    ingredientsAnalysis: [],
  };
  return scoreProduct(product);
}
