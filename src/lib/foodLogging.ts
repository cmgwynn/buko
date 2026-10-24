import type { Factor } from './scoring/factors.ts';
import type { Food, FoodLogEntry, FoodSource, Meal, Nutrients } from '../types/index.ts';
import { round1, type Macros } from './diary.ts';

/** Nutrients that must be known before a food can be logged; unknown values are never stored as zero. */
export const REQUIRED_MACROS = ['calories', 'protein', 'carbs', 'fat'] as const;
export type RequiredMacro = (typeof REQUIRED_MACROS)[number];

const MACRO_LABELS: Record<RequiredMacro, string> = { calories: 'calories', protein: 'protein', carbs: 'carbs', fat: 'fat' };
export const MAX_LOG_GRAMS = 5000;

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function missingRequiredMacros(per100g: Nutrients): RequiredMacro[] {
  return REQUIRED_MACROS.filter((k) => !known(per100g[k]));
}

/** Plain-English warning for a food missing required nutrition, or null when it is complete. */
export function incompleteNutritionMessage(per100g: Nutrients): string | null {
  const missing = missingRequiredMacros(per100g);
  if (!missing.length) return null;
  return `This food's source doesn't list ${missing.map((k) => MACRO_LABELS[k]).join(', ')}. Buko won't log unknown values as zero. Enter the nutrition from the label to continue.`;
}

/** Macros for `grams` of a food, or null when any required nutrient is unknown or the amount is invalid. */
export function completeMacrosForGrams(per100g: Nutrients, grams: number): Macros | null {
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_LOG_GRAMS) return null;
  if (missingRequiredMacros(per100g).length) return null;
  const k = grams / 100;
  return { calories: per100g.calories! * k, protein_g: per100g.protein! * k, carbs_g: per100g.carbs! * k, fat_g: per100g.fat! * k };
}

export type AmountUnit = 'g' | 'serving';

export interface ServingOption {
  unit: AmountUnit;
  /** Grams in one unit. */
  grams: number;
  label: string;
}

/** Measurement choices backed by the food's data. A serving is offered only when the source gives its weight. */
export function servingOptions(food: Food): ServingOption[] {
  const options: ServingOption[] = [];
  if (food.servingG !== null && Number.isFinite(food.servingG) && food.servingG > 0) {
    const g = Math.round(food.servingG * 10) / 10;
    const label = food.servingLabel?.trim();
    options.push({ unit: 'serving', grams: food.servingG, label: label ? `Servings (${label})` : `Servings (${g} g)` });
  }
  options.push({ unit: 'g', grams: 1, label: 'Grams' });
  return options;
}

/** Parse a user-entered amount; returns grams or null when invalid. */
export function amountToGrams(amount: string, unit: AmountUnit, food: Food): number | null {
  const qty = Number(amount.trim().replace(',', '.'));
  if (!amount.trim() || !Number.isFinite(qty) || qty <= 0) return null;
  const option = servingOptions(food).find((o) => o.unit === unit);
  if (!option) return null;
  const grams = qty * option.grams;
  return grams > 0 && grams <= MAX_LOG_GRAMS ? grams : null;
}

export interface LoggedAmount {
  quantity: number;
  unit: AmountUnit;
}

/**
 * Rebuild a Food from a diary entry's own nutrition snapshot. A serving is offered only when the
 * entry was logged in servings, so its weight comes from the entry rather than a guess.
 */
export function foodFromEntry(e: FoodLogEntry): { food: Food; last: LoggedAmount } | null {
  const grams = Number(e.grams);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  const k = 100 / grams;
  const quantity = Number(e.quantity);
  const servingUnit = e.unit === 'serving' && Number.isFinite(quantity) && quantity > 0;
  const food: Food = {
    source: e.source, sourceId: e.source_id ?? e.name, name: e.name, brand: e.brand, imageUrl: null,
    per100g: {
      calories: Number(e.calories) * k, protein: Number(e.protein_g) * k, carbs: Number(e.carbs_g) * k, fat: Number(e.fat_g) * k,
      sugars: null, saturatedFat: null, sodiumMg: null, fiber: null,
    },
    servingG: servingUnit ? grams / quantity : null,
    servingLabel: servingUnit ? `${round1(grams / quantity)} g as previously logged` : null,
  };
  return { food, last: servingUnit ? { quantity, unit: 'serving' } : { quantity: round1(grams), unit: 'g' } };
}

export interface RecentFood {
  key: string;
  food: Food;
  last: LoggedAmount;
  lastGrams: number;
}

export const recentKey = (e: Pick<FoodLogEntry, 'source' | 'source_id' | 'name'>) => `${e.source}:${e.source_id ?? e.name}`;

/** Distinct recently logged foods, newest first, each with the amount last logged. */
export function recentFoods(entries: FoodLogEntry[], limit = 15): RecentFood[] {
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const e of entries) {
    const key = recentKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    const rebuilt = foodFromEntry(e);
    if (!rebuilt) continue;
    out.push({ key, ...rebuilt, lastGrams: Number(e.grams) });
    if (out.length === limit) break;
  }
  return out;
}

export interface EntryInsert {
  user_id: string;
  logged_on: string;
  meal: Meal;
  source: FoodSource;
  source_id: string | null;
  name: string;
  brand: string | null;
  quantity: number;
  unit: AmountUnit;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Diary row for an amount of a food, or an error message when it can't be logged honestly. */
export function buildEntryInsert(
  food: Food,
  opts: { userId: string; date: string; meal: Meal; amount: string; unit: AmountUnit },
): { row: EntryInsert } | { error: string } {
  const incomplete = incompleteNutritionMessage(food.per100g);
  if (incomplete) return { error: incomplete };
  const grams = amountToGrams(opts.amount, opts.unit, food);
  if (grams === null) return { error: `Enter an amount greater than 0 and up to ${MAX_LOG_GRAMS.toLocaleString()} g.` };
  const m = completeMacrosForGrams(food.per100g, grams)!;
  return {
    row: {
      user_id: opts.userId, logged_on: opts.date, meal: opts.meal,
      source: food.source, source_id: food.sourceId, name: food.name, brand: food.brand,
      quantity: Number(opts.amount.trim().replace(',', '.')), unit: opts.unit, grams: round1(grams),
      calories: round1(m.calories), protein_g: round1(m.protein_g), carbs_g: round1(m.carbs_g), fat_g: round1(m.fat_g),
    },
  };
}

/** Rows that copy diary entries to another day/meal from their stored snapshots (no ids, health links or timestamps). */
export function copyEntryRows(entries: FoodLogEntry[], opts: { userId: string; date: string; meal?: Meal }): EntryInsert[] {
  return entries.map((e) => ({
    user_id: opts.userId, logged_on: opts.date, meal: opts.meal ?? e.meal,
    source: e.source, source_id: e.source_id, name: e.name, brand: e.brand,
    quantity: Number(e.quantity), unit: e.unit === 'serving' ? 'serving' : 'g', grams: Number(e.grams),
    calories: Number(e.calories), protein_g: Number(e.protein_g), carbs_g: Number(e.carbs_g), fat_g: Number(e.fat_g),
  }));
}

/**
 * Row that restores a just-deleted entry from its own snapshot, keeping its day, meal and position.
 * Returns null unless the snapshot belongs to the signed-in user. The health-app link is not restored;
 * the restored row is mirrored again as a new sample.
 */
export function restoreEntryRow(entry: FoodLogEntry, userId: string): (EntryInsert & { created_at: string }) | null {
  if (!userId || entry.user_id !== userId) return null;
  const [row] = copyEntryRows([entry], { userId, date: entry.logged_on, meal: entry.meal });
  return { ...row, created_at: entry.created_at };
}

const sameLog = (a: Pick<FoodLogEntry, 'source' | 'source_id' | 'name' | 'grams'>, b: Pick<FoodLogEntry, 'source' | 'source_id' | 'name' | 'grams'>) =>
  recentKey(a) === recentKey(b) && Math.abs(Number(a.grams) - Number(b.grams)) < 0.05;

/**
 * Split a meal copy into entries to add and entries that already appear in the target meal
 * (same food and amount), so repeating a copy does not silently double-log. Each existing entry
 * matches at most one source entry, so genuinely repeated items (two eggs logged twice) still copy.
 */
export function planMealCopy(source: FoodLogEntry[], target: FoodLogEntry[]): { toAdd: FoodLogEntry[]; duplicates: FoodLogEntry[] } {
  const available = [...target];
  const toAdd: FoodLogEntry[] = [];
  const duplicates: FoodLogEntry[] = [];
  for (const e of source) {
    const i = available.findIndex((t) => sameLog(t, e));
    if (i >= 0) {
      available.splice(i, 1);
      duplicates.push(e);
    } else {
      toAdd.push(e);
    }
  }
  return { toAdd, duplicates };
}

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function sumEntries(entries: Pick<FoodLogEntry, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[]): DayTotals {
  return entries.reduce(
    (t, e) => ({ calories: t.calories + Number(e.calories), protein: t.protein + Number(e.protein_g), carbs: t.carbs + Number(e.carbs_g), fat: t.fat + Number(e.fat_g) }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export interface ManualFoodForm {
  name: string;
  brand: string;
  /** Grams the nutrition values refer to, e.g. "100" or a label serving such as "30". */
  basisGrams: string;
  servingLabel: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  barcode?: string;
}

export type ManualFoodErrors = Partial<Record<'name' | 'basisGrams' | RequiredMacro | 'form', string>>;

const parseNumber = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Validate label nutrition typed by the user and convert it to a Food (per 100 g).
 * All four required values must be entered; zero is accepted only when typed.
 */
export function parseManualFood(form: ManualFoodForm): { food: Food } | { errors: ManualFoodErrors } {
  const errors: ManualFoodErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';
  const basis = parseNumber(form.basisGrams);
  if (basis === null || basis <= 0 || basis > MAX_LOG_GRAMS) errors.basisGrams = 'Enter the weight these values are for, in grams.';
  const values: Partial<Record<RequiredMacro, number>> = {};
  for (const k of REQUIRED_MACROS) {
    const v = parseNumber(form[k]);
    if (v === null) errors[k] = 'Required. Enter 0 only if the label says 0.';
    else if (v < 0) errors[k] = 'Must be 0 or more.';
    else values[k] = v;
  }
  if (basis !== null && basis > 0 && values.protein !== undefined && values.carbs !== undefined && values.fat !== undefined) {
    if (values.protein + values.carbs + values.fat > basis * 1.05) {
      errors.form = 'Protein, carbs and fat add up to more than the weight. Check the amounts and the weight they refer to.';
    }
  }
  if (basis !== null && basis > 0 && values.calories !== undefined && (values.calories / basis) * 100 > 950) {
    errors.calories = 'That is more energy than pure fat. Check whether the label shows kJ instead of kcal.';
  }
  if (Object.keys(errors).length) return { errors };
  const k = 100 / basis!;
  const barcode = form.barcode?.replace(/\D/g, '') || null;
  const label = form.servingLabel.trim();
  return {
    food: {
      source: 'manual',
      sourceId: barcode ?? `manual:${name.toLowerCase()}`,
      name, brand: form.brand.trim() || null, imageUrl: null,
      per100g: {
        calories: values.calories! * k, protein: values.protein! * k, carbs: values.carbs! * k, fat: values.fat! * k,
        sugars: null, saturatedFat: null, sodiumMg: null, fiber: null,
      },
      servingG: basis === 100 && !label ? null : basis!,
      servingLabel: label || null,
    },
  };
}

/** Prefill manual-entry fields from a food's known per-100 g values (unknown stays blank). */
export function manualFormFromFood(food: Food | null, barcode?: string): ManualFoodForm {
  const v = (n: number | null | undefined) => (known(n) ? String(round1(n)) : '');
  return {
    name: food?.name ?? '', brand: food?.brand ?? '', basisGrams: '100', servingLabel: '',
    calories: v(food?.per100g.calories), protein: v(food?.per100g.protein), carbs: v(food?.per100g.carbs), fat: v(food?.per100g.fat),
    barcode: barcode ?? (food && 'barcode' in food ? String((food as { barcode?: string }).barcode ?? '') : undefined),
  };
}

export type SearchFilter = 'all' | 'recent' | 'whole' | 'packaged' | 'recipes';

/** Case-insensitive match of every query word in the text (used for recent foods and recipes). */
export function matchesQuery(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Which remote sources a search needs for a filter; avoids rate-limited calls the user can't see. */
export function sourcesForFilter(filter: SearchFilter): { whole: boolean; packaged: boolean } {
  return { whole: filter === 'all' || filter === 'whole', packaged: filter === 'all' || filter === 'packaged' };
}

/** Sequence guard: only the latest started request may update state. */
export function createLatestGate() {
  let current = 0;
  return {
    start(): number { current += 1; return current; },
    isLatest(token: number): boolean { return token === current; },
    cancel(): void { current += 1; },
  };
}

/** The few factors that most moved a product's score, strongest effect first. Unknown factors are skipped. */
export function mainScoreReasons(factors: Factor[], count = 3): Factor[] {
  return factors
    .filter((f) => f.points !== null)
    .map((f) => ({ f, impact: Math.abs((f.points as number) - 50) * f.weight }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, count)
    .map((x) => x.f);
}
