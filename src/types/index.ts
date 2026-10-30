export type Goal = 'lose' | 'maintain' | 'gain';
export type Sex = 'male' | 'female' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type DietPref = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free' | 'nut_free';
export type Units = 'metric' | 'imperial';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodSource = 'off' | 'usda' | 'manual' | 'recipe';
export type GrocerySource = 'off' | 'usda' | 'manual' | 'plan';

export interface Profile {
  user_id: string;
  goal: Goal;
  sex: Sex;
  birth_year: number;
  /** Calendar date (YYYY-MM-DD); absent/null until legacy users supply their birthday. */
  birth_date?: string | null;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  diet_prefs: DietPref[];
  units: Units;
}

export interface NutritionTargets {
  user_id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  bmr: number;
  tdee: number;
  floor_applied: boolean;
  adaptive_calorie_adjustment?: number;
}

/** Nutrient amounts per 100 g (or 100 ml). `null` means the source did not report it. */
export interface Nutrients {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugars: number | null;
  saturatedFat: number | null;
  sodiumMg: number | null;
  fiber: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  potassiumMg?: number | null;
  vitaminCMg?: number | null;
  vitaminDMcg?: number | null;
}

export type MicronutrientKey = 'calciumMg' | 'ironMg' | 'potassiumMg' | 'vitaminCMg' | 'vitaminDMcg';
export type MicronutrientValues = Record<MicronutrientKey, number | null>;

export interface Food {
  source: FoodSource;
  sourceId: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  per100g: Nutrients;
  /** Grams in one labelled serving, when the source provides it. */
  servingG: number | null;
  servingLabel: string | null;
  /** Source food category (USDA foodCategory), used to spot fruit/veg/legume/nut ingredients. */
  category?: string | null;
}

export type NutriGrade = 'a' | 'b' | 'c' | 'd' | 'e';

export interface Additive {
  /** Taxonomy tag without language prefix, e.g. "e330". */
  code: string;
  name: string;
}

export interface Product extends Food {
  barcode: string;
  /** Most general → most specific Open Food Facts category tags (e.g. "en:breakfast-cereals"). */
  categoryTags: string[];
  nutriscoreGrade: NutriGrade | null;
  novaGroup: 1 | 2 | 3 | 4 | null;
  additives: Additive[];
  allergens: string[];
  /** Open Food Facts ingredient analysis tags, e.g. "en:vegan", "en:non-vegetarian". */
  ingredientsAnalysis: string[];
  /** True for synthetic products (recipes) whose additive content is not known; the factor is then skipped. */
  additivesUnknown?: boolean;
}

export interface FoodLogEntry {
  id: string;
  user_id: string;
  logged_on: string;
  meal: Meal;
  source: FoodSource;
  source_id: string | null;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Amounts for this logged serving; null means the source did not report them. */
  micronutrients?: MicronutrientValues | null;
  created_at: string;
  health_external_id?: string | null;
}export interface GroceryItem {
  id: string;
  user_id: string;
  name: string;
  barcode: string | null;
  source: GrocerySource;
  source_id: string | null;
  quantity: string | null;
  section: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'other';
  generated_week: string | null;
  from_recipes: string[];
  checked: boolean;
  checked_at: string | null;
  created_at: string;
}
