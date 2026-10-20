import { round1 } from '../diary';
import { supabase } from '../supabase';
import type { Meal } from '../../types';
import { computeRecipeNutrition } from './nutrition';
import type { MealPlanEntry, Recipe, RecipeIngredient } from './types';

export type RecipeWithNutrition = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'grams' | 'nutrition'>[] };

/** Log a number of servings of a recipe to the diary and, when it came from the plan, mark the entry as eaten. */
export async function logRecipeServings(
  userId: string,
  recipe: RecipeWithNutrition,
  opts: { servings: number; meal: Meal; date: string; planEntryId?: string },
): Promise<string | null> {
  const n = computeRecipeNutrition(recipe.recipe_ingredients, recipe.servings);
  if (n.counted === 0) return 'This recipe has no nutrition data yet. Edit it and match its ingredients first.';
  const ps = n.perServing;
  const { error } = await supabase.from('food_log_entries').insert({
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
  });
  if (error) return error.message;
  if (opts.planEntryId) {
    await supabase.from('meal_plan_entries').update({ logged_at: new Date().toISOString() }).eq('id', opts.planEntryId);
  }
  return null;
}

export const logPlanEntry = (userId: string, recipe: RecipeWithNutrition, entry: MealPlanEntry) =>
  logRecipeServings(userId, recipe, { servings: entry.servings, meal: entry.meal, date: entry.planned_on, planEntryId: entry.id });
