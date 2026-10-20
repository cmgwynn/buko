import type { Food } from '../../types';
import { searchWholeFoods } from '../api/usda';
import { parseIngredient } from './ingredientParser';
import { canonicalName, sectionFor } from './sections';
import type { IngredientDraft } from './types';
import { estimateGrams } from './units';

/** Parse an ingredient line into a draft with quantity, unit, name, section and an estimated weight. */
export function draftFromText(text: string, position: number): IngredientDraft {
  const p = parseIngredient(text);
  return {
    position,
    raw_text: text,
    quantity: p.quantity,
    unit: p.unit,
    name: p.name,
    grams: p.sizeGrams && p.quantity !== null ? p.quantity * p.sizeGrams : estimateGrams(p.quantity, p.unit, p.name),
    food_source: null,
    food_source_id: null,
    nutrition: null,
    section: sectionFor(p.name),
    match_status: 'unmatched',
  };
}

/** Re-parse after the user edits an ingredient line; keeps the food match if the ingredient is still the same thing. */
export function reparse(prev: IngredientDraft, text: string): IngredientDraft {
  const next = draftFromText(text, prev.position);
  const sameFood = canonicalName(next.name) === canonicalName(prev.name);
  if (sameFood && prev.match_status !== 'unmatched') {
    return {
      ...next,
      food_source: prev.food_source,
      food_source_id: prev.food_source_id,
      nutrition: prev.nutrition,
      match_status: prev.match_status,
      grams: next.grams ?? prev.grams,
    };
  }
  return next;
}

export function applyFood(ing: IngredientDraft, food: Food): IngredientDraft {
  return {
    ...ing,
    food_source: food.source === 'off' ? 'off' : 'usda',
    food_source_id: food.sourceId,
    nutrition: { per100g: food.per100g, category: food.category ?? null },
    match_status: 'matched',
  };
}

/** Words that make a USDA search worse without changing which food is meant. */
const NOISE = /\b(fresh|large|small|medium|chopped|diced|minced|sliced|ripe|finely|roughly|big|extra|virgin|organic|boneless|skinless|to taste|optional|freshly|ground|crushed|shredded|grated|finely|chopped|pickled|english)\b/gi;

/** Recipe wording that USDA's naming handles poorly, mapped to a query that finds the plain food. */
const REWRITES: [RegExp, string][] = [
  [/^(.*)\boil$/, 'oil $1'],
  [/\bground beef\b/, 'beef ground raw'],
  [/\bwaffle fries\b|\bfrench fries\b|\bfries\b/, 'potatoes french fried frozen'],
  [/^(fresh |chopped |thai )*(spear)?mint$/, 'spearmint fresh'],
  [/\bbean sprouts\b/, 'mung beans sprouted raw'],
  [/\bmayo\b|\bmayonnaise\b/, 'mayonnaise regular'],
  [/\bwhite sugar\b|^sugar$|\bgranulated sugar\b/, 'sugars granulated'],
  [/\bwhite vinegar\b/, 'vinegar distilled'],
  [/\bred pepper flakes\b|\bchili flakes\b/, 'spices pepper red or cayenne'],
  [/\bburger pickles\b/, 'pickles cucumber dill'],
  [/\bpickled carrots\b/, 'carrots raw'],
];

/** Results that are almost never what a recipe means: candy, restaurant items, and variants ("light", "ghee"). */
const WRONG_KIND = /\b(candies|candy|restaurant|fast foods?|burger king|mcdonald|wendy|corned|cured|babyfood|dessert|topping|ghee|clarified|snacks?|bar|beverages?|extruded)\b/i;
const DIET_VARIANT = /\b(light|lite|low fat|reduced|fat free|nonfat|diet)\b/i;

/** Pick the best USDA match for an ingredient name; null if nothing sensible comes back. */
export async function autoMatch(name: string): Promise<Food | null> {
  const original = name.toLowerCase().replace(/\s+/g, ' ').trim();
  let query = name.replace(NOISE, ' ').replace(/\s+/g, ' ').trim() || name;
  // Rewrites see the original wording, because noise words like "ground" matter to them.
  for (const [re, to] of REWRITES) {
    if (re.test(original)) {
      query = original.replace(re, to).trim();
      break;
    }
  }
  // Spice blends and packet mixes vary too much to guess; leave them for the user to review.
  if (/\b(seasoning|rub|mix|packet)\b/.test(original)) return null;
  const results = await searchWholeFoods(query, 10);
  if (results.length === 0) return null;
  const q = canonicalName(query);
  // Prefer a result whose name starts with the query ("Spinach, baby" for "spinach") over processed variants.
  const scored = results.map((f, i) => {
    const n = canonicalName(f.name);
    const starts = n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2;
    const raw = /\b(raw)\b/i.test(f.name) ? 0 : 1;
    const processed = /\b(souffle|canned|fried|babyfood|cooked|salad|dressing|mix)\b/i.test(f.name) ? 1 : 0;
    const wrong = WRONG_KIND.test(f.name) && !WRONG_KIND.test(name) ? 500 : 0;
    const sweet = /^sweet /i.test(f.name) && !/sweet/.test(original) ? 200 : 0;
    const diet = DIET_VARIANT.test(f.name) && !DIET_VARIANT.test(name) ? 200 : 0;
    return { f, key: starts * 100 + processed * 10 + raw * 5 + i + wrong + diet + sweet };
  });
  scored.sort((a, b) => a.key - b.key);
  // If even the best candidate is a candy or restaurant item, no match is better than a wrong one.
  return scored[0].key >= 500 ? null : scored[0].f;
}

/**
 * Match every ingredient that has no food yet. Failures are left unmatched for the user to resolve,
 * never silently guessed.
 */
export async function matchAll(ings: IngredientDraft[]): Promise<IngredientDraft[]> {
  const out: IngredientDraft[] = [];
  for (const ing of ings) {
    if (ing.match_status !== 'unmatched' || !ing.name.trim()) {
      out.push(ing);
      continue;
    }
    try {
      const food = await autoMatch(ing.name);
      out.push(food ? applyFood(ing, food) : ing);
    } catch {
      out.push(ing);
    }
  }
  return out;
}
