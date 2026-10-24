import type { Units } from '../../types/index.ts';

/**
 * Unit handling for recipes and grocery lists.
 *
 * Every quantity belongs to one of three dimensions. Amounts are only ever added together
 * within the same dimension (grams with grams, millilitres with millilitres, counts with counts),
 * because converting between them needs a density or piece weight that we can only estimate.
 */
export type Dimension = 'mass' | 'volume' | 'count';

interface UnitDef {
  dim: Dimension;
  /** Amount of the base unit (g for mass, ml for volume, 1 for count) in one of this unit. */
  factor: number;
  canonical: string;
}

const def = (dim: Dimension, factor: number, canonical: string): UnitDef => ({ dim, factor, canonical });

const UNIT_TABLE: Record<string, UnitDef> = {};
function add(names: string[], u: UnitDef) {
  for (const n of names) UNIT_TABLE[n] = u;
}
add(['g', 'gram', 'grams', 'gr'], def('mass', 1, 'g'));
add(['kg', 'kilogram', 'kilograms', 'kilo', 'kilos'], def('mass', 1000, 'kg'));
add(['oz', 'ounce', 'ounces'], def('mass', 28.3495, 'oz'));
add(['lb', 'lbs', 'pound', 'pounds'], def('mass', 453.592, 'lb'));
add(['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'], def('volume', 1, 'ml'));
add(['l', 'liter', 'liters', 'litre', 'litres'], def('volume', 1000, 'l'));
add(['tsp', 'tsps', 'teaspoon', 'teaspoons', 't'], def('volume', 4.92892, 'tsp'));
add(['tbsp', 'tbsps', 'tbs', 'tablespoon', 'tablespoons', 'T'], def('volume', 14.7868, 'tbsp'));
add(['cup', 'cups', 'c'], def('volume', 236.588, 'cup'));
add(['fl oz', 'floz', 'fluid ounce', 'fluid ounces'], def('volume', 29.5735, 'fl oz'));
add(['pint', 'pints', 'pt'], def('volume', 473.176, 'pint'));
add(['quart', 'quarts', 'qt'], def('volume', 946.353, 'quart'));
add(['gallon', 'gallons', 'gal'], def('volume', 3785.41, 'gallon'));
add(['pinch', 'pinches'], def('volume', 0.31, 'pinch'));
add(['dash', 'dashes'], def('volume', 0.62, 'dash'));

/** Known count-style units. Anything else a recipe uses ("clove", "can") is kept as a count label. */
const COUNT_UNITS = new Set([
  'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'piece', 'pieces', 'stick', 'sticks', 'bunch', 'bunches',
  'head', 'heads', 'sprig', 'sprigs', 'stalk', 'stalks', 'package', 'packages', 'pkg', 'jar', 'jars', 'bag', 'bags',
  'fillet', 'fillets', 'leaf', 'leaves', 'handful', 'handfuls', 'bottle', 'bottles', 'box', 'boxes',
]);

export function isKnownUnitWord(word: string): boolean {
  const w = word.toLowerCase().replace(/\.$/, '');
  return w in UNIT_TABLE || word in UNIT_TABLE || COUNT_UNITS.has(w);
}

export interface ResolvedUnit {
  dim: Dimension;
  factor: number;
  canonical: string;
}

/** Resolve a unit word to a dimension. Null/unknown units are counts. */
export function resolveUnit(unit: string | null | undefined): ResolvedUnit {
  if (!unit) return { dim: 'count', factor: 1, canonical: '' };
  const raw = unit.trim().replace(/\.$/, '');
  const hit = UNIT_TABLE[raw] ?? UNIT_TABLE[raw.toLowerCase()];
  if (hit) return hit;
  return { dim: 'count', factor: 1, canonical: singularCountUnit(raw.toLowerCase()) };
}

function singularCountUnit(u: string): string {
  if (u === 'leaves') return 'leaf';
  if (u === 'bunches') return 'bunch';
  if (u === 'pinches') return 'pinch';
  return u.endsWith('s') ? u.slice(0, -1) : u;
}

/** Approximate grams per millilitre, for converting volume measures of common ingredients to weight. */
const DENSITY: [RegExp, number][] = [
  // Light, bulky foods are far lighter than water per cup; treating them as water overstates calories.
  [/\b(cilantro|coriander|parsley|basil|mint|dill|chives?|thyme|rosemary|sage|oregano|tarragon|herbs?)\b/, 0.1],
  [/\b(lettuce|spinach|arugula|rocket|kale|greens|salad)\b/, 0.15],
  [/\b(sprouts)\b/, 0.44],
  [/\b(peanuts|cashews|pistachios|hazelnuts|pine nuts)\b/, 0.6],
  [/\b(carrots?|radish|celery|cucumber|onions?|shallots?|zucchini|broccoli|cauliflower|mushrooms?|bell pepper|cabbage|tomatoes)\b/, 0.55],
  [/\b(flour)\b/, 0.53],
  [/\b(powdered sugar|icing sugar|confectioners)\b/, 0.56],
  [/\b(brown sugar)\b/, 0.93],
  [/\b(sugar)\b/, 0.85],
  [/\b(butter|margarine)\b/, 0.96],
  [/\b(oil)\b/, 0.92],
  [/\b(honey|maple syrup|molasses|syrup)\b/, 1.38],
  [/\b(milk|cream|yogurt|yoghurt|buttermilk)\b/, 1.03],
  [/\b(rolled oats|oats|oatmeal)\b/, 0.34],
  [/\b(rice)\b/, 0.8],
  [/\b(salt)\b/, 1.2],
  [/\b(cocoa)\b/, 0.46],
  [/\b(peanut butter|nut butter)\b/, 1.07],
  [/\b(cheese)\b/, 0.42],
  [/\b(nuts|almonds|walnuts|pecans)\b/, 0.5],
  [/\b(breadcrumbs)\b/, 0.45],
];

export function densityFor(name: string): number {
  const n = name.toLowerCase();
  for (const [re, d] of DENSITY) if (re.test(n)) return d;
  return 1;
}

/** Typical weight in grams of one whole item, for recipes that list "2 onions" or "3 cloves garlic". */
const PIECE_G: [RegExp, number][] = [
  [/\begg\b|\beggs\b/, 50],
  [/\bshrimp|\bprawn/, 12],
  [/\bonion/, 110],
  [/\bshallot/, 30],
  [/\bgarlic\b/, 3], // per clove when a clove unit is used
  [/\btomato/, 120],
  [/\bpotato/, 170],
  [/\bsweet potato/, 200],
  [/\bcarrot/, 60],
  [/\bbanana/, 118],
  [/\bapple/, 180],
  [/\blemon/, 60],
  [/\blime/, 45],
  [/\borange/, 130],
  [/\bbell pepper|\bcapsicum|\bpepper\b/, 150],
  [/\bavocado/, 150],
  [/\bzucchini|\bcourgette/, 200],
  [/\bcucumber/, 300],
  [/\bchicken breast/, 170],
  [/\bbread\b/, 30],
  [/\btortilla/, 45],
  [/\bcelery/, 40],
  [/\bmushroom/, 20],
];

const COUNT_UNIT_G: Record<string, number> = { slice: 30, stick: 113, can: 400, bunch: 100, head: 500, sprig: 1, stalk: 40, package: 250, jar: 350, fillet: 150, leaf: 1, handful: 30, bottle: 500, bag: 300, box: 300, piece: 100 };

/**
 * Estimate grams for an ingredient quantity. Returns null when we cannot estimate honestly,
 * so the app asks the user instead of guessing.
 */
export function estimateGrams(quantity: number | null, unit: string | null, name: string): number | null {
  if (quantity === null) return null;
  const u = resolveUnit(unit);
  if (u.dim === 'mass') return quantity * u.factor;
  if (u.dim === 'volume') return quantity * u.factor * densityFor(name);

  const lower = name.toLowerCase();
  const garlicClove = u.canonical === 'clove' && /garlic/.test(lower);
  if (garlicClove) return quantity * 3;
  if (u.canonical && COUNT_UNIT_G[u.canonical] !== undefined) {
    const specific = PIECE_G.find(([re]) => re.test(lower));
    // "1 slice bread" uses the bread weight; "1 can tomatoes" uses the can weight.
    if (u.canonical === 'slice' && specific) return quantity * specific[1];
    return quantity * COUNT_UNIT_G[u.canonical];
  }
  const hit = PIECE_G.find(([re]) => re.test(lower));
  return hit ? quantity * hit[1] : null;
}

/** Quantity scaled to a different number of servings. */
export const scaleQuantity = (quantity: number | null, fromServings: number, toServings: number): number | null =>
  quantity === null || fromServings <= 0 ? quantity : (quantity * toServings) / fromServings;

const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

/** Friendly quantity for display, e.g. 1.5 → "1½", 0.333 → "⅓", 12.4 → "12". */
export function formatQuantity(n: number): string {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n);
  const frac = n - whole;
  if (frac < 0.06) return String(whole || 0);
  if (frac > 0.94) return String(whole + 1);
  const best = FRACTIONS.reduce((a, b) => (Math.abs(b[0] - frac) < Math.abs(a[0] - frac) ? b : a));
  if (Math.abs(best[0] - frac) > 0.04) return String(Math.round(n * 10) / 10);
  return `${whole || ''}${best[1]}`;
}

export interface DisplayAmount {
  text: string;
  value: number;
  unit: string;
}

/**
 * Pick a human-friendly unit for a base amount (g / ml / count) in the user's unit system.
 * 1,500 g → "1.5 kg"; 480 ml → "2 cups" for imperial users.
 */
export function displayAmount(dim: Dimension, baseAmount: number, countUnit: string, system: Units): DisplayAmount {
  if (dim === 'count') {
    const label = baseAmount > 1 && countUnit ? pluralCount(countUnit) : countUnit;
    return { value: baseAmount, unit: countUnit, text: `${formatQuantity(baseAmount)}${label ? ' ' + label : ''}` };
  }
  if (dim === 'mass') {
    if (system === 'imperial') {
      return baseAmount >= 453.592 * 0.9
        ? mk(baseAmount / 453.592, 'lb')
        : mk(baseAmount / 28.3495, 'oz');
    }
    return baseAmount >= 1000 ? mk(baseAmount / 1000, 'kg') : mk(Math.round(baseAmount / 5) * 5 || Math.round(baseAmount), 'g');
  }
  if (system === 'imperial') {
    if (baseAmount < 14.7868 * 3) return mk(baseAmount / 4.92892, 'tsp');
    if (baseAmount < 236.588 / 4) return mk(baseAmount / 14.7868, 'tbsp');
    return mk(baseAmount / 236.588, 'cup');
  }
  return baseAmount >= 1000 ? mk(baseAmount / 1000, 'l') : mk(Math.round(baseAmount / 5) * 5 || Math.round(baseAmount), 'ml');
}

function mk(value: number, unit: string): DisplayAmount {
  const v = unit === 'kg' || unit === 'lb' ? Math.round(value * 10) / 10 : value;
  const text = unit === 'cup' && v > 1 ? `${formatQuantity(v)} cups` : `${unit === 'kg' || unit === 'lb' ? v : formatQuantity(v)} ${unit}`;
  return { value: v, unit, text };
}

function pluralCount(u: string): string {
  if (u === 'leaf') return 'leaves';
  if (u === 'bunch') return 'bunches';
  return u.endsWith('s') ? u : `${u}s`;
}
