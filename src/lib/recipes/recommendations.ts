import type { DietPref, Meal, Nutrients } from '../../types/index.ts';
import { computeRecipeNutrition } from './nutrition.ts';
import type { RecipeIngredient } from './types.ts';

export const MACRO_KEYS = ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const;
type MacroKey = typeof MACRO_KEYS[number];
export type KnownMacros = Record<MacroKey, number | null>;
type Ingredient = Pick<RecipeIngredient, 'name' | 'grams' | 'nutrition'>;
export interface MealCandidate {
  id: string;
  title: string;
  source: 'saved' | 'library';
  servings: number;
  ingredients: readonly Ingredient[];
  meal?: Meal;
  dietTags?: readonly string[];
}
export interface PlannedMeal {
  recipeId: string;
  meal: Meal;
  servings: number;
  logged: boolean;
}
const nutrientKeys: Record<MacroKey, keyof Nutrients> = {
  calories: 'calories', protein_g: 'protein', carbs_g: 'carbs', fat_g: 'fat',
};
const dietNames: Record<DietPref, string> = {
  vegan: 'Vegan', vegetarian: 'Vegetarian', gluten_free: 'Gluten-free', dairy_free: 'Dairy-free', nut_free: 'Nut-free',
};
const meat = 'meat|chicken|beef|pork|bacon|ham|sausage|turkey|duck|lamb|veal|fish|salmon|cod|shrimp|prawns?|tuna|anchov\\w*|sardines?|oysters?|clams?|mussels?|crab|lobster|gelatin|lard|worcestershire|caesar';
const conflicts: Record<string, RegExp> = {
  Vegan: new RegExp(`\\b(${meat}|eggs?|milk|yogurt|yoghurt|cheese|butter|honey|whey|casein\\w*|cream|ghee)\\b`),
  Vegetarian: new RegExp(`\\b(${meat})\\b`),
  'Gluten-free': /\b(wheat|bulgur|barley|rye|couscous|seitan|soy sauce|bread|pasta|oats?|flour|tortillas?|pita|malt)\b/,
  'Dairy-free': /\b(milk|yogurt|yoghurt|cheese|butter|cream|whey|casein\w*|ghee)\b/,
  'Nut-free': /\b(peanut\w*|groundnut\w*|almond\w*|walnut\w*|cashew\w*|pistachio\w*|pecan\w*|hazelnut\w*|macadamia\w*|nuts|nut butter|pesto|marzipan)\b/,
};
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Conservative explicit conflicts only. Passing these checks never establishes dietary/allergy safety. */
export function hasDietConflict(candidate: MealCandidate, preferences: readonly DietPref[]): boolean {
  const tags = new Set([...preferences.map((pref) => dietNames[pref]), ...(candidate.dietTags ?? [])]);
  return [...tags].some((tag) => candidate.ingredients.some((ingredient) => {
    let name = normalized(ingredient.name);
    if (tag === 'Dairy-free' || tag === 'Vegan') {
      name = name.replace(/\b(almond|oat|soy|coconut) milk\b/g, 'plant beverage')
        .replace(/\b(peanut|almond|cashew|sunflower) butter\b/g, 'plant spread');
    }
    if (tag === 'Gluten-free') name = name.replace(/\bgluten free (pasta|bread|oats|flour|tortillas?|pita|soy sauce)\b/g, 'substitute');
    return conflicts[tag]?.test(name)
      || ((tag === 'Vegan' || tag === 'Vegetarian') && /\b(stock|broth)\b/.test(name) && !/\b(vegetable|mushroom)\b/.test(name));
  }));
}

/** A missing ingredient weight or nutrient makes that entire macro unknown, not a zero subtotal. */
export function candidateMacros(candidate: MealCandidate): KnownMacros {
  const nutrition = computeRecipeNutrition([...candidate.ingredients], candidate.servings);
  return Object.fromEntries(MACRO_KEYS.map((key) => {
    const known = valid(candidate.servings) && candidate.servings > 0 && candidate.ingredients.length > 0
      && candidate.ingredients.every((ingredient) => valid(ingredient.grams) && ingredient.grams > 0
        && valid(ingredient.nutrition?.per100g?.[nutrientKeys[key]]));
    const value = nutrition.perServing[key];
    return [key, known && valid(value) ? value : null];
  })) as KnownMacros;
}

/** Only sum reported values; an empty successful log really does contain zero logged intake. */
export function intakeMacros(rows: readonly Partial<KnownMacros>[]): KnownMacros {
  return Object.fromEntries(MACRO_KEYS.map((key) => {
    const total = rows.reduce((sum, row) => sum + (valid(row[key]) ? row[key] : NaN), 0);
    return [key, valid(total) ? total : null];
  })) as KnownMacros;
}

const mealShares: Record<Meal, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };
export function recommendMeals(input: {
  candidates: readonly MealCandidate[];
  preferences: readonly DietPref[];
  targets: Partial<KnownMacros> | null;
  meal: Meal;
  planned: readonly PlannedMeal[];
  intake: KnownMacros | null;
  isToday: boolean;
  limit?: number;
}) {
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const usedIntake = input.isToday && input.intake !== null;
  const planned = input.planned.filter((entry) => !usedIntake || !entry.logged);
  const plannedMacros = planned.map((entry) => {
    const candidate = byId.get(entry.recipeId);
    return { entry, macros: candidate ? candidateMacros(candidate) : null };
  });
  const occupied = new Set(input.planned.map((entry) => entry.meal));
  const shares = (Object.keys(mealShares) as Meal[]).filter((meal) => meal === input.meal || !occupied.has(meal))
    .reduce((sum, meal) => sum + mealShares[meal], 0);
  const remaining = {} as KnownMacros;
  const budget = {} as KnownMacros;
  for (const key of MACRO_KEYS) {
    const target = input.targets?.[key];
    const consumed = usedIntake ? input.intake![key] : 0;
    let reserved = 0;
    for (const { entry, macros } of plannedMacros) {
      const value = macros?.[key];
      reserved += valid(value) && valid(entry.servings) && entry.servings > 0 ? value * entry.servings : NaN;
    }
    const value = valid(target) && target > 0 && valid(consumed) && valid(reserved)
      ? Math.max(0, target - consumed - reserved) : null;
    remaining[key] = value;
    budget[key] = value === null ? null : value * mealShares[input.meal] / shares;
  }
  const plannedIds = new Set(input.planned.map((entry) => entry.recipeId));
  const plannedTitles = new Set(input.planned.map((entry) => normalized(byId.get(entry.recipeId)?.title ?? '')));
  const seen = new Set<string>();
  const candidates = [...input.candidates].sort((a, b) => Number(a.source === 'library') - Number(b.source === 'library') || compare(a.id, b.id))
    .filter((candidate) => {
      const title = normalized(candidate.title);
      if (plannedIds.has(candidate.id) || plannedTitles.has(title) || seen.has(title)
        || candidate.meal && candidate.meal !== input.meal || hasDietConflict(candidate, input.preferences)) return false;
      seen.add(title);
      return true;
    });
  const recommendations = candidates.map((candidate) => {
    const macros = candidateMacros(candidate);
    const fitKeys = MACRO_KEYS.filter((key) => budget[key] !== null);
    const known = MACRO_KEYS.filter((key) => macros[key] !== null).length;
    const comparable = fitKeys.filter((key) => macros[key] !== null);
    // Unknown dimensions cannot earn a better fit than reported dimensions.
    const missing = fitKeys.length - comparable.length;
    const distance = comparable.reduce((sum, key) => {
      const expected = budget[key]!;
      return sum + Math.abs(macros[key]! - expected) / Math.max(expected, key === 'calories' ? 100 : 10);
    }, 0) / Math.max(1, comparable.length);
    return { candidate, macros, missing, distance, known };
  }).sort((a, b) => a.missing - b.missing || a.distance - b.distance || b.known - a.known
    || compare(a.candidate.title, b.candidate.title) || compare(a.candidate.id, b.candidate.id))
    .slice(0, Math.max(0, Math.floor(input.limit ?? 3)));
  return { recommendations, remaining, budget, usedIntake,
    incompletePlan: plannedMacros.some(({ entry, macros }) => !valid(entry.servings) || entry.servings <= 0
      || !macros || MACRO_KEYS.some((key) => macros[key] === null)) };
}
