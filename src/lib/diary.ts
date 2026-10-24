import type { Food, Meal, Nutrients } from '../types/index.ts';

export const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
];

/** Default meal based on local time of day. */
export function defaultMeal(date = new Date()): Meal {
  const h = date.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the user's day). */
export function toDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + delta));
}

export function formatDay(dateStr: string): string {
  const today = toDateString(new Date());
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Nutrition for `grams` of a food, from its per-100 g values. */
export function macrosForGrams(per100g: Nutrients, grams: number): Macros {
  const k = grams / 100;
  return {
    calories: (per100g.calories ?? 0) * k,
    protein_g: (per100g.protein ?? 0) * k,
    carbs_g: (per100g.carbs ?? 0) * k,
    fat_g: (per100g.fat ?? 0) * k,
  };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function defaultGrams(food: Food): number {
  return food.servingG ?? 100;
}
