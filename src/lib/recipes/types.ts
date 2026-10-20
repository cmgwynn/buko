import type { Meal, Nutrients } from '../../types';

export type Section = 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'other';
export type MatchStatus = 'matched' | 'unmatched' | 'manual';

export const SECTIONS: { key: Section; label: string }[] = [
  { key: 'produce', label: 'Produce' },
  { key: 'dairy', label: 'Dairy & eggs' },
  { key: 'meat', label: 'Meat & fish' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'frozen', label: 'Frozen' },
  { key: 'other', label: 'Other' },
];

/** Snapshot of the matched food's nutrition, stored on the ingredient so recipes never need a re-lookup. */
export interface IngredientNutrition {
  per100g: Nutrients;
  /** USDA food category, used for the fruit/veg/legume share in Nutri-Score. */
  category?: string | null;
}

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_url: string | null;
  source_name: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  user_id: string;
  position: number;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  grams: number | null;
  food_source: 'usda' | 'off' | 'manual' | null;
  food_source_id: string | null;
  nutrition: IngredientNutrition | null;
  section: Section;
  match_status: MatchStatus;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  user_id: string;
  position: number;
  text: string;
  timer_seconds: number | null;
}

export interface MealPlanEntry {
  id: string;
  user_id: string;
  planned_on: string;
  meal: Meal;
  recipe_id: string;
  servings: number;
  logged_at: string | null;
}

export interface PantryItem {
  id: string;
  user_id: string;
  name: string;
  canonical_name: string;
  quantity: number | null;
  unit: string | null;
  section: Section;
  updated_at: string;
}

/** Editable ingredient before it is saved (no ids). */
export type IngredientDraft = Omit<RecipeIngredient, 'id' | 'recipe_id' | 'user_id'>;
export type StepDraft = Omit<RecipeStep, 'id' | 'recipe_id' | 'user_id'>;
