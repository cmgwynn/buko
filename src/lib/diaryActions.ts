import type { FoodLogEntry } from '../types';
import { recentKey, type RecentFood, foodFromEntry, planMealCopy } from './foodLogging';
import { MEALS } from './diary';

export interface FoodFavorite {
  id: string; user_id: string; food_key: string;
  snapshot: Pick<FoodLogEntry, 'source' | 'source_id' | 'name' | 'brand' | 'quantity' | 'unit' | 'grams' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>;
}
export function favoriteFood(favorite: FoodFavorite): RecentFood | null {
  const entry: FoodLogEntry = {
    ...favorite.snapshot, id: favorite.id, user_id: favorite.user_id,
    logged_on: '', created_at: '', meal: 'breakfast',
  };
  const rebuilt = foodFromEntry(entry);
  return rebuilt ? { ...rebuilt, key: recentKey(entry), lastGrams: Number(entry.grams) } : null;
}

export type DiaryTransferInput =
  | { mode: 'copy' | 'move'; entryId: string; targetDate: string; targetMeal: FoodLogEntry['meal'] }
  | { mode: 'day'; sourceDate: string; targetDate: string };
export interface DiaryTransferResult {
  changed: number; skipped: number; entries: { id: string; health_external_id: string | null }[];
}
export function planDayCopy(source: FoodLogEntry[], destination: FoodLogEntry[]) {
  const toAdd: FoodLogEntry[] = [];
  const duplicates: FoodLogEntry[] = [];
  for (const { key } of MEALS) {
    const meal = planMealCopy(source.filter((entry) => entry.meal === key), destination.filter((entry) => entry.meal === key));
    toAdd.push(...meal.toAdd); duplicates.push(...meal.duplicates);
  }
  return { toAdd, duplicates };
}
