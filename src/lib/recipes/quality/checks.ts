import { COMMUNITY_CUISINES, COMMUNITY_MEALS, DIET_TAGS } from '../communityPolicy.ts';
import { computeRecipeNutrition } from '../nutrition.ts';
import { estimateGrams, resolveUnit } from '../units.ts';
import type { IngredientDraft } from '../types.ts';
import type { QualityIssue, QualityRecipe, QualityReport, RecipeConstraints } from './types.ts';

const recipeKeys = ['title', 'servings', 'prepMinutes', 'cookMinutes', 'cuisine', 'mealTypes', 'dietTags', 'ingredients', 'steps'];
const ingredientKeys = ['position', 'raw_text', 'quantity', 'unit', 'name', 'grams', 'food_source', 'food_source_id', 'nutrition', 'section', 'match_status'];
const nutrientKeys = ['calories', 'protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'sodiumMg', 'fiber'];
export const normalizeFood = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const text = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((key) => key in v);
export function isRecord(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
const strings = (v: unknown, allowed: readonly string[]) => Array.isArray(v) && v.length <= allowed.length && v.every((s) => typeof s === 'string' && allowed.includes(s));

export function isQualityRecipe(value: unknown): value is QualityRecipe {
  if (!isRecord(value) || !exact(value, recipeKeys) || !text(value.title, 160)
    || !finite(value.servings, 0.25, 100) || !finite(value.prepMinutes, 0, 1440) || !finite(value.cookMinutes, 0, 1440)
    || !COMMUNITY_CUISINES.includes(value.cuisine as never) || !strings(value.mealTypes, COMMUNITY_MEALS)
    || !(value.mealTypes as unknown[]).length || !strings(value.dietTags, DIET_TAGS)
    || !Array.isArray(value.ingredients) || !value.ingredients.length || value.ingredients.length > 60
    || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 40) return false;
  return value.ingredients.every((i, position) => isRecord(i) && exact(i, ingredientKeys)
    && i.position === position && text(i.name, 300) && text(i.raw_text, 500)
    && (i.unit === null || typeof i.unit === 'string' && i.unit.length <= 50)
    && finite(i.quantity, 0.0001, 100000) && finite(i.grams, 0.0001, 100000)
    && ['usda', 'off', 'manual', null].includes(i.food_source as never)
    && (i.food_source_id === null || text(i.food_source_id, 100))
    && ['produce', 'dairy', 'meat', 'pantry', 'frozen', 'other'].includes(String(i.section))
    && ['matched', 'unmatched', 'manual'].includes(String(i.match_status))
    && (i.nutrition === null || isRecord(i.nutrition)
      && Object.keys(i.nutrition).every((key) => ['per100g', 'category'].includes(key))
      && (i.nutrition.category == null || typeof i.nutrition.category === 'string' && i.nutrition.category.length <= 200)
      && isRecord(i.nutrition.per100g) && exact(i.nutrition.per100g, nutrientKeys)
      && nutrientKeys.every((key) => {
        const n = (i.nutrition as { per100g: Record<string, unknown> }).per100g[key];
        return n === null || finite(n, 0, key === 'sodiumMg' ? 100000 : key === 'calories' ? 1000 : 100);
      })))
    && value.steps.every((s, position) => isRecord(s) && exact(s, ['position', 'text', 'timer_seconds'])
      && s.position === position && text(s.text, 4000) && (s.timer_seconds === null || finite(s.timer_seconds, 1, 86400)));
}

export function stableRecipeJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : isRecord(v)
    ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, sort(v[key])])) : v;
  return JSON.stringify(sort(value));
}
export function ingredientIdentity(i: IngredientDraft): string {
  return stableRecipeJson([normalizeFood(i.name), i.food_source, i.food_source_id, i.nutrition, i.section, i.match_status]);
}
function dietaryFood(name: string, tag: string): string {
  if (tag === 'Gluten-free')
    return name.replace(/\bgluten free (pasta|bread|oats|flour|tortillas?|pita|soy sauce)\b/g, 'verified substitute');
  if (tag === 'Dairy-free' || tag === 'Vegan')
    return name.replace(/\b(almond|oat|soy|coconut) milk\b/g, 'plant beverage')
      .replace(/\b(peanut|almond|cashew|sunflower) butter\b/g, 'seed spread');
  return name;
}

const dietConflicts: Record<string, RegExp> = {
  Vegan: /\b(chicken|beef|pork|turkey|duck|lamb|veal|fish|salmon|cod|shrimp|prawn|tuna|anchov\w*|sardine|oyster|clam|mussel|crab|lobster|egg\w*|milk|yogurt|yoghurt|cheese|butter|honey|gelatin|whey|casein\w*|cream|ghee|lard|worcestershire|caesar)\b/,
  Vegetarian: /\b(chicken|beef|pork|turkey|duck|lamb|veal|fish|salmon|cod|shrimp|prawn|tuna|anchov\w*|sardine|oyster|clam|mussel|crab|lobster|gelatin|lard|worcestershire|caesar)\b/,
  'Gluten-free': /\b(wheat|bulgur|barley|rye|couscous|seitan|soy sauce|bread|pasta|oats?|flour|tortillas?|pita|malt)\b/,
  'Dairy-free': /\b(milk|yogurt|yoghurt|cheese|butter|cream|whey|casein\w*|ghee)\b/,
  'Nut-free': /\b(peanut\w*|groundnut\w*|almond\w*|walnut\w*|cashew\w*|pistachio\w*|pecan\w*|hazelnut\w*|macadamia\w*|nuts|nut butter|pesto|marzipan)\b/,
};

/** Conservative ingredient checks, not allergen certification or a substitute for checking labels. */
export function checkRecipe(value: unknown, constraints: RecipeConstraints = { dietTags: [], excludedIngredients: [] }, trustedIngredients?: IngredientDraft[]): QualityReport {
  const issues: QualityIssue[] = [];
  const add = (category: QualityIssue['category'], detail: string, severity: QualityIssue['severity'] = 'warning') => issues.push({ category, severity, detail });
  if (!isQualityRecipe(value)) return { valid: false, issues: [{ category: 'scope', severity: 'blocking', detail: 'Recipe structure, quantities, metadata or steps are invalid.' }] };
  const r = value;
  const names = r.ingredients.map((i) => normalizeFood(i.name));
  const instructions = normalizeFood(r.steps.map((s) => s.text).join(' '));
  for (const tag of new Set([...constraints.dietTags, ...r.dietTags])) {
    if (!DIET_TAGS.includes(tag as never)) { add('restriction', `Unsupported diet restriction: ${tag}.`, 'blocking'); continue; }
    for (const name of names) {
      if (dietConflicts[tag].test(dietaryFood(name, tag))) add('restriction', `${tag} conflicts with ingredient ${name}; check labels.`, 'blocking');
      if ((tag === 'Vegan' || tag === 'Vegetarian') && /\b(stock|broth)\b/.test(name) && !/\b(vegetable|mushroom)\b/.test(name))
        add('restriction', `${tag} cannot be verified for unspecified stock or broth.`, 'blocking');
    }
  }
  for (const excluded of [...constraints.excludedIngredients, ...(constraints.dislikedIngredients ?? [])]) {
    const key = normalizeFood(excluded);
    const group = key === 'nuts' ? dietConflicts['Nut-free'] : key === 'dairy' ? dietConflicts['Dairy-free']
      : key === 'gluten' ? dietConflicts['Gluten-free'] : null;
    if (key && names.some((name) => name.includes(key) || key.includes(name) || group?.test(name))) add('restriction', `Excluded ingredient: ${excluded}.`, 'blocking');
  }
  if (constraints.cuisine && r.cuisine !== constraints.cuisine || constraints.mealType && !r.mealTypes.includes(constraints.mealType))
    add('restriction', 'Cuisine or meal type does not match the request.', 'blocking');
  if (constraints.maxMinutes !== undefined && r.prepMinutes + r.cookMinutes > constraints.maxMinutes)
    add('practicality', 'Total time exceeds the requested limit.', 'blocking');
  if (constraints.maxCookMinutes != null && r.cookMinutes > constraints.maxCookMinutes)
    add('practicality', 'Cooking time exceeds the saved preference.', 'blocking');
  if (r.prepMinutes + r.cookMinutes === 0) add('technique', 'Preparation and cooking cannot both take zero minutes.', 'blocking');
  if (r.ingredients.length > 12) add('practicality', constraints.weeknight
    ? 'Weeknight complexity: more than 12 ingredients; consider a simpler approved base.'
    : 'More than 12 ingredients may be complex for a weeknight.');
  if (r.steps.length > 10 || r.prepMinutes + r.cookMinutes > 60) add('practicality', 'Review active work, equipment and weeknight timing.');
  const catalog = trustedIngredients && new Set(trustedIngredients.map(ingredientIdentity));
  for (const i of r.ingredients) {
    if (catalog && !catalog.has(ingredientIdentity(i))) add('scope', `Untrusted identity or altered nutrition: ${i.name}.`, 'blocking');
    if (catalog && !normalizeFood(i.raw_text).includes(normalizeFood(i.name)))
      add('scope', `Ingredient text does not preserve its canonical identity: ${i.name}.`, 'blocking');
    const unit = resolveUnit(i.unit);
    const estimated = estimateGrams(i.quantity, i.unit, i.name);
    if (estimated && unit.dim !== 'count' && Math.abs(estimated - i.grams!) > Math.max(0.05, estimated * (unit.dim === 'mass' ? 0.01 : 0.3)))
      add('scope', `Quantity and grams disagree for ${i.name}.`, 'blocking');
    const tokens = normalizeFood(i.name).split(' ').filter((word) => word.length > 3 && !['fresh', 'ground', 'cooked', 'without', 'salt', 'added', 'plain', 'unsalted', 'reduced', 'sodium', 'skinless', 'boneless'].includes(word));
    if (tokens.length && !tokens.some((word) => instructions.includes(word)) && !/\ball ingredients\b/.test(instructions))
      add('compatibility', `Usage of ${i.name} is unclear; verify every ingredient is used.`);
    if (/\bsalt\b/i.test(i.name) && !/\b(without|no salt|unsalted|reduced|added|sauce)\b/i.test(i.name)) {
      const grams = unit.dim === 'mass' ? i.quantity! * unit.factor : unit.dim === 'volume' ? estimateGrams(i.quantity, i.unit, 'salt') : i.grams;
      const perServing = grams! / r.servings;
      if (perServing > 2) add('seasoning', `Salt is high (${perServing.toFixed(2)} g per serving), before other sodium.`);
      else if (perServing < 0.15) add('seasoning', 'Salt quantity is low per serving; other sodium may make this intentional.');
    }
  }
  const food = names.join(' ');
  const knownFoods = ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'shrimp', 'tuna', 'egg', 'milk', 'cheese', 'butter', 'honey', 'peanut', 'almond', 'cashew', 'wheat', 'rice', 'pasta', 'soy sauce'];
  for (const mentioned of knownFoods) {
    if (new RegExp(`\\b${mentioned}(?:s)?\\b`).test(instructions)
      && !names.some((name) => name.includes(mentioned)))
      add('compatibility', `Instructions mention unlisted ingredient ${mentioned}.`, 'blocking');
  }
  const sweetContext = /\b(oats|yogurt|yoghurt|banana|berries|blueberries|fruit|apple|dessert|porridge|smoothie)\b/.test(food);
  const sodium = r.ingredients.reduce((sum, i) => sum + (i.nutrition?.per100g.sodiumMg ?? 0) * i.grams! / 100, 0) / r.servings;
  if (!sweetContext && !/\b(salt|soy sauce|miso|cheese|stock|broth|sauce|olives|capers)\b/.test(food)) add('seasoning', 'No obvious salt or concentrated sodium source; omission may be intentional.');
  if (!sweetContext && !/\b(lemon|lime|vinegar|tomato\w*|yogurt|yoghurt|tamarind|citrus|pickle\w*)\b/.test(food)) add('balance', 'No obvious acid source; not every dish needs added acid.');
  if (sodium > 1000) add('seasoning', 'Concentrated sodium exceeds 1000 mg per serving; review combined sources.');
  if (/\braw\b.*\b(chicken|turkey|poultry)\b|\b(chicken|turkey|poultry)\b.*\braw\b/.test(food)) {
    if (r.cookMinutes < 10) add('technique', 'Raw poultry cooking time is implausibly short.', 'blocking');
    if (!/\b(internal|thickest|thermometer|reaches)\b/.test(instructions) || !/\b(165|74)\b/.test(instructions))
      add('technique', 'Raw poultry requires measured internal temperature of 165 F / 74 C; oven temperature is not internal temperature.', 'blocking');
  }
  if (/\b(raw|uncooked|dry)\b/.test(food) && r.cookMinutes === 0 && /\b(chicken|meat|rice|lentils|beans|pasta)\b/.test(food))
    add('technique', 'Uncooked ingredient has no cooking time.', 'blocking');
  if (/\b(dry|uncooked)\b/.test(food) && /\b(rice|pasta|lentils|beans)\b/.test(food) && r.cookMinutes > 0 && r.cookMinutes < 5)
    add('technique', 'Dry grains, pasta or legumes have an implausibly short cook time; check the package method.', 'blocking');
  if (/\b(raw|uncooked)\b/.test(food) && !/\b(chicken|turkey|poultry)\b/.test(food))
    add('technique', 'Safety for raw ingredients has not been established by these checks; consult applicable supplied authoritative guidance.');
  const nutrition = computeRecipeNutrition(r.ingredients, r.servings);
  if (!nutrition.complete) add('scope', 'Nutrition is incomplete; macro targets and safety cannot be inferred from partial values.');
  if (constraints.targetCalories !== undefined || constraints.targetProtein !== undefined) {
    if (!nutrition.complete) add('restriction', 'Macro targets require complete authoritative nutrition.', 'blocking');
    else {
      if (constraints.targetCalories !== undefined && Math.abs(nutrition.perServing.calories - constraints.targetCalories) > constraints.targetCalories * 0.2)
        add('restriction', 'Calculated calories are outside the requested 20% tolerance.', 'blocking');
      if (constraints.targetProtein !== undefined && nutrition.perServing.protein_g < constraints.targetProtein)
        add('restriction', 'Calculated protein is below the requested target.', 'blocking');
    }
  }
  return { valid: !issues.some((issue) => issue.severity === 'blocking'), issues };
}
