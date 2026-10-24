import { computeRecipeNutrition, scoreRecipe } from './nutrition.ts';
import type { IngredientDraft, RecipeDraft } from './types.ts';
import type { Nutrients } from '../../types/index.ts';

export const DIET_TAGS = ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Nut-free'] as const;
export type DietTag = typeof DIET_TAGS[number];
export const COMMUNITY_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export const COMMUNITY_CUISINES = ['Italian', 'Mexican', 'American', 'Filipino', 'Mediterranean', 'Indian', 'Chinese', 'Japanese', 'Thai', 'Middle Eastern', 'Everyday'] as const;
const nutrientKeys = ['calories', 'protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'sodiumMg', 'fiber'] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recipe data.');
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error(`Text must be ${min}–${max} characters.`);
  return value.trim();
}
function nullableNumber(value: unknown, max: number): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('Invalid recipe quantity.');
  return value;
}

export function communityPublishInput(value: unknown) {
  const input = object(value);
  const recipeId = text(input.recipeId, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipeId)
    || input.confirmRights !== true || !Array.isArray(input.tags) || input.tags.length > 5
    || input.tags.some((tag) => !DIET_TAGS.some((allowed) => allowed === tag))
    || !COMMUNITY_MEALS.some((meal) => meal === input.meal) || !COMMUNITY_CUISINES.some((cuisine) => cuisine === input.cuisine)) {
    throw new Error('Check recipe, categories and sharing permission.');
  }
  const tags = input.tags;
  return { recipeId, description: text(input.description, 1, 2000), meal: input.meal, cuisine: input.cuisine,
    tags: DIET_TAGS.filter((tag) => tags.includes(tag)) };
}

/** Whitelist the shared snapshot: never publish private IDs, photos, source URLs or extra fields. */
export function communitySnapshot(recipe: unknown, ingredients: unknown, steps: unknown) {
  const r = object(recipe);
  const servings = nullableNumber(r.servings, 100);
  if (!servings || !Array.isArray(ingredients) || ingredients.length < 1 || ingredients.length > 100
    || !Array.isArray(steps) || steps.length < 1 || steps.length > 100) throw new Error('Add servings, ingredients and cooking steps before publishing.');
  const matched: IngredientDraft[] = ingredients.map((value, position) => {
    const i = object(value);
    let nutrition: IngredientDraft['nutrition'] = null;
    if (i.nutrition != null) {
      const n = object(i.nutrition);
      const input = object(n.per100g);
      const per100g: Nutrients = { calories: null, protein: null, carbs: null, fat: null, sugars: null, saturatedFat: null, sodiumMg: null, fiber: null };
      for (const key of nutrientKeys) per100g[key] = nullableNumber(input[key], key === 'sodiumMg' ? 100000 : key === 'calories' ? 1000 : 100);
      nutrition = { per100g, category: n.category == null ? null : text(n.category, 0, 200) };
    }
    const source = i.food_source;
    return {
      position, raw_text: text(i.raw_text, 1, 500), name: text(i.name, 1, 300),
      quantity: nullableNumber(i.quantity, 100000), unit: i.unit == null ? null : text(i.unit, 0, 50),
      grams: nullableNumber(i.grams, 100000), nutrition,
      food_source: source === 'usda' || source === 'off' || source === 'manual' ? source : null,
      food_source_id: i.food_source_id == null ? null : text(i.food_source_id, 0, 100),
      section: 'pantry', match_status: nutrition ? 'matched' : 'unmatched',
    };
  });
  const payload = {
    title: text(r.title, 1, 160), servings,
    prepMinutes: nullableNumber(r.prep_minutes, 10080), cookMinutes: nullableNumber(r.cook_minutes, 10080),
    ingredients: matched,
    steps: steps.map((value, position) => {
      const s = object(value);
      return { position, text: text(s.text, 1, 4000), timer_seconds: nullableNumber(s.timer_seconds, 86400) };
    }),
    search: matched.map((i) => i.name).join(' '),
  };
  const complete = matched.every((i) => i.grams !== null && i.grams > 0 && i.nutrition
    && nutrientKeys.every((key) => i.nutrition!.per100g[key] !== null));
  const nutrition = complete ? computeRecipeNutrition(matched, servings) : null;
  return { payload, score: nutrition ? scoreRecipe(payload.title, nutrition).score : null, calories: nutrition?.perServing.calories ?? null };
}

export type CommunityPayload = ReturnType<typeof communitySnapshot>['payload'];
export function communityCopy(payload: CommunityPayload, parentId: string): RecipeDraft {
  return {
    ...structuredClone(payload), communityParentId: parentId,
    sourceName: 'Shared recipe copy', sourceUrl: null, photoPath: null, photoUri: null,
  };
}
export function dietaryWarnings(tags: readonly string[], ingredients: readonly { name: string }[]): string[] {
  const food = ingredients.map((i) => i.name).join(' ').toLowerCase();
  const checks: Record<DietTag, RegExp> = {
    Vegan: /\b(chicken|beef|pork|turkey|fish|salmon|cod|shrimp|tuna|egg|eggs|milk|yogurt|cheese|butter|honey|gelatin)\b/,
    Vegetarian: /\b(chicken|beef|pork|turkey|fish|salmon|cod|shrimp|tuna|gelatin|anchovy)\b/,
    'Gluten-free': /\b(wheat|bulgur|barley|rye|couscous|seitan|soy sauce|bread|pasta|oats)\b/,
    'Dairy-free': /\b(milk|yogurt|cheese|butter|cream|whey|casein)\b/,
    'Nut-free': /\b(peanut|peanuts|almond|almonds|walnut|cashew|pistachio|pecan|hazelnut|nuts)\b/,
  };
  return DIET_TAGS.filter((tag) => tags.includes(tag) && checks[tag].test(food))
    .map((tag) => `${tag}: check ingredients for possible conflicts. This keyword check can miss ingredients or flag substitutes.`);
}
