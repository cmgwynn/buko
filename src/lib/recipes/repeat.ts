import { addDays } from '../diary';
import type { MealPlanEntry } from './types';

export function repeatPlanRows(entries: MealPlanEntry[], userId: string, offset: number) {
  if (!Number.isInteger(offset) || offset === 0) throw new Error('Choose a different day to copy meals to.');
  return entries.map((entry) => ({
    user_id: userId, planned_on: addDays(entry.planned_on, offset),
    meal: entry.meal, recipe_id: entry.recipe_id, servings: Number(entry.servings), logged_at: null,
  }));
}
