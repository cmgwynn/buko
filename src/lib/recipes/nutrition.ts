import type { Nutrients, Product } from '../../types/index.ts';
import { macrosForGrams, type Macros } from '../diary.ts';
import { computeNutriScore, type NutriScoreResult } from '../scoring/nutriscore.ts';
import { scoreProduct, type ScoreResult } from '../scoring/index.ts';
import type { RecipeIngredient } from './types.ts';

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
  /** Every ingredient has a finite positive weight and all eight finite, nonnegative nutrients. */
  complete: boolean;
  scoreEligible: boolean;
  incompleteIngredients: number;
  missingNutrients: (keyof Nutrients)[];
}

const KEYS: (keyof Nutrients)[] = ['calories', 'protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'sodiumMg', 'fiber'];

export function computeRecipeNutrition(ingredients: NutrIngredient[], servings: number): RecipeNutrition {
  const sums: Record<string, number> = Object.fromEntries(KEYS.map((k) => [k, 0]));
  let totalGrams = 0;
  let fvlGrams = 0;
  let counted = 0;
  let excluded = 0;
  let incompleteIngredients = 0;
  const missingNutrients = new Set<keyof Nutrients>();

  for (const ing of ingredients) {
    const validWeight = typeof ing.grams === 'number' && Number.isFinite(ing.grams) && ing.grams > 0;
    const missing = KEYS.filter((key) => {
      const value = ing.nutrition?.per100g?.[key];
      return typeof value !== 'number' || !Number.isFinite(value) || value < 0;
    });
    missing.forEach((key) => missingNutrients.add(key));
    if (!validWeight || missing.length) incompleteIngredients++;
    if (!validWeight || !ing.nutrition?.per100g) {
      excluded++;
      continue;
    }
    counted++;
    totalGrams += ing.grams!;
    const per100 = ing.nutrition.per100g;
    // Preserve numeric subtotal shapes, but never present a subtotal as complete nutrition.
    for (const k of KEYS) {
      const value = per100[k];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) sums[k] += (value * ing.grams!) / 100;
    }
    if (FVLN_CATEGORY.test(ing.nutrition.category ?? '')) fvlGrams += ing.grams!;
  }

  const validServings = Number.isFinite(servings) && servings > 0;
  const safeServings = validServings ? servings : 1;
  const subtotalPer100g = Object.fromEntries(KEYS.map((k) => [k, totalGrams > 0 ? (sums[k] / totalGrams) * 100 : null])) as unknown as Nutrients;
  const total = macrosForGrams(subtotalPer100g, totalGrams);
  const per100g = { ...subtotalPer100g };
  for (const key of missingNutrients) per100g[key] = null;
  const perServing: Macros = {
    calories: total.calories / safeServings,
    protein_g: total.protein_g / safeServings,
    carbs_g: total.carbs_g / safeServings,
    fat_g: total.fat_g / safeServings,
  };
  const fvlPercent = totalGrams > 0 ? (fvlGrams / totalGrams) * 100 : 0;
  const complete = ingredients.length > 0 && incompleteIngredients === 0 && validServings
    && Number.isFinite(totalGrams) && Object.values(sums).every(Number.isFinite)
    && Object.values(perServing).every(Number.isFinite) && Number.isFinite(totalGrams / safeServings);
  return {
    totalGrams,
    total,
    perServing,
    perServingGrams: totalGrams / safeServings,
    per100g,
    fvlPercent,
    nutriScore: complete ? computeNutriScore(per100g, fvlPercent) : null,
    excluded,
    counted,
    complete,
    scoreEligible: complete,
    incompleteIngredients,
    missingNutrients: [...missingNutrients],
  };
}

/**
 * Score a recipe with the same module used for packaged products. The recipe becomes a synthetic
 * product: its Nutri-Score is computed from the ingredient totals, NOVA is unknown (generic
 * ingredients have no processing group) and additives are unknown, so those factors are skipped
 * and the remaining factors are re-weighted by the scoring module.
 */
export function scoreRecipe(title: string, nutrition: RecipeNutrition): ScoreResult {
  if (!nutrition.scoreEligible) {
    return { score: null, rating: 'unknown', ratingLabel: 'Incomplete nutrition', factors: [], confidence: 0 };
  }
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

export function recipeNutritionMessage(nutrition: RecipeNutrition): string | null {
  if (nutrition.complete) return null;
  return 'Nutrition is incomplete. Give every ingredient a positive weight and match a food with all eight nutrients before scoring or logging this recipe. Shown totals are partial estimates.';
}

/** Shared by the diary logger and its pure validation tests. */
export function recipeLoggingError(nutrition: RecipeNutrition, servings: number): string | null {
  return recipeNutritionMessage(nutrition)
    ?? (!Number.isFinite(servings) || servings <= 0
      || !Number.isFinite(nutrition.perServingGrams * servings)
      || Object.values(nutrition.perServing).some((value) => !Number.isFinite(value * servings))
      ? 'Choose a positive, valid number of servings.' : null);
}
