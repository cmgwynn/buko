import { round1 } from '../diary';
import { maybeWriteNutrition } from '../health';
import { supabase } from '../supabase';
import type { Meal } from '../../types';
import { computeRecipeNutrition, recipeLoggingError } from './nutrition';
import type { MealPlanEntry, Recipe, RecipeIngredient } from './types';

export type RecipeWithNutrition = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'grams' | 'nutrition'>[] };

/** Log a number of servings of a recipe to the diary and, when it came from the plan, mark the entry as eaten. */
export async function logRecipeServings(
  userId: string,
  recipe: RecipeWithNutrition,
  opts: { servings: number; meal: Meal; date: string; planEntryId?: string },
): Promise<string | null> {
  const n = computeRecipeNutrition(recipe.recipe_ingredients, recipe.servings);
  const incomplete = recipeLoggingError(n, opts.servings);
  if (incomplete) return incomplete;
  const ps = n.perServing;
  const { data: inserted, error } = await supabase.from('food_log_entries').insert({
    user_id: userId,
    logged_on: opts.date,
    meal: opts.meal,
    source: 'recipe',
    source_id: recipe.id,
    name: recipe.title,
    brand: null,
    quantity: opts.servings,
    unit: 'serving',
    grams: round1(Math.max(1, n.perServingGrams * opts.servings)),
    calories: round1(ps.calories * opts.servings),
    protein_g: round1(ps.protein_g * opts.servings),
    carbs_g: round1(ps.carbs_g * opts.servings),
    fat_g: round1(ps.fat_g * opts.servings),
  }).select('id').single();
  if (error) return error.message;
  maybeWriteNutrition((inserted as { id: string }).id);
  if (opts.planEntryId) {
    const { error: planError } = await supabase.from('meal_plan_entries').update({ logged_at: new Date().toISOString() }).eq('id', opts.planEntryId);
    if (planError) return 'Your food was logged, but the plan could not be marked eaten. Do not log it again; refresh the diary to check it.';
  }
  return null;
}

export const logPlanEntry = (userId: string, recipe: RecipeWithNutrition, entry: MealPlanEntry) =>
  logRecipeServings(userId, recipe, { servings: entry.servings, meal: entry.meal, date: entry.planned_on, planEntryId: entry.id });
