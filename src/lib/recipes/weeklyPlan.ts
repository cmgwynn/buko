import { addDays } from '../diary.ts';
import type { DietPref, Meal } from '../../types/index.ts';
import { candidateMacros, MACRO_KEYS, recommendMeals, type KnownMacros, type MealCandidate } from './recommendations.ts';

export interface WeeklyEntry {
  id: string;
  date: string;
  meal: Meal;
  recipeId: string;
  servings: number;
  logged: boolean;
}
export const mealSlotKey = (date: string, meal: Meal) => `${date}:${meal}`;
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Match explicit title/ingredient phrases, never implied allergen safety. */
export function foodExcluded(candidate: MealCandidate, exclusions: readonly string[]): boolean {
  return exclusions.some((excluded) => {
    const phrase = normalize(excluded);
    return phrase && [candidate.title, ...candidate.ingredients.map((ingredient) => ingredient.name)].some((value) => {
      const name = ` ${normalize(value)} `;
      return name.includes(` ${phrase} `);
    });
  });
}

export function generateWeeklyMealPlan(input: {
  weekStart: string;
  dates: readonly string[];
  meals: readonly Meal[];
  replaceSlots: readonly string[];
  entries: readonly WeeklyEntry[];
  candidates: readonly MealCandidate[];
  preferences: readonly DietPref[];
  foodExclusions: readonly string[];
  targets: Partial<KnownMacros> | null;
  /** Per-date targets (e.g. training-day fueling); falls back to `targets`. */
  dailyTargets?: Readonly<Record<string, Partial<KnownMacros>>>;
  today: string;
  intake: KnownMacros | null;
  /** Recipe ids the user swapped away from, per slot key. */
  swappedOut?: Readonly<Record<string, readonly string[]>>;
}) {
  const week = Array.from({ length: 7 }, (_, index) => addDays(input.weekStart, index));
  const dates = week.filter((date) => input.dates.includes(date));
  const meals = (['breakfast', 'lunch', 'dinner', 'snack'] as Meal[]).filter((meal) => input.meals.includes(meal));
  const candidates = input.candidates.filter((candidate) => !foodExcluded(candidate, input.foodExclusions));
  const eligible = new Set(candidates.map((candidate) => candidate.id));
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const usage = new Map<string, number>();
  const slots: {
    date: string; meal: Meal; candidate: MealCandidate | null; servings: number;
    macros: KnownMacros | null; replaceIds: string[]; reason: string;
  }[] = [];
  const selected = new Set(dates.flatMap((date) => meals.map((meal) => mealSlotKey(date, meal))));
  const replaceable = (entry: WeeklyEntry) => selected.has(mealSlotKey(entry.date, entry.meal))
    && input.replaceSlots.includes(mealSlotKey(entry.date, entry.meal))
    && !input.entries.some((other) => other.date === entry.date && other.meal === entry.meal && other.logged);
  const retained = input.entries.filter((entry) => !replaceable(entry));
  for (const entry of retained) {
    const title = normalize(byId.get(entry.recipeId)?.title ?? entry.recipeId);
    usage.set(title, (usage.get(title) ?? 0) + 1);
  }
  for (const date of dates) {
    let planned = retained.filter((entry) => entry.date === date).map((entry) => ({
      recipeId: entry.recipeId, meal: entry.meal, servings: entry.servings, logged: entry.logged,
    }));
    for (const meal of meals) {
      const existing = input.entries.filter((entry) => entry.date === date && entry.meal === meal);
      if (existing.length && (!input.replaceSlots.includes(mealSlotKey(date, meal)) || existing.some((entry) => entry.logged))) {
        slots.push({ date, meal, candidate: null, servings: 0, macros: null, replaceIds: [], reason: existing.some((entry) => entry.logged) ? 'Preserved: contains a logged meal.' : 'Preserved: occupied slot not selected for replacement.' });
        continue;
      }
      const result = recommendMeals({
        candidates: input.candidates, preferences: input.preferences, targets: input.dailyTargets?.[date] ?? input.targets, meal, planned,
        intake: input.intake, isToday: date === input.today, limit: input.candidates.length,
      });
      // Prefer variety among recipes with equally usable goal data, then deterministic goal fit.
      const ranked = result.recommendations.filter((choice) => eligible.has(choice.candidate.id)).sort((a, b) => a.missing - b.missing
        || (usage.get(normalize(a.candidate.title)) ?? 0) - (usage.get(normalize(b.candidate.title)) ?? 0)
        || a.distance - b.distance || b.known - a.known
        || (a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0));
      const swapped = input.swappedOut?.[mealSlotKey(date, meal)] ?? [];
      const fresh = ranked.filter((option) => !swapped.includes(option.candidate.id));
      // Once every option has been swapped away, cycle back to the best fit instead of leaving the slot empty.
      const choice = (fresh.length ? fresh : ranked)[0];
      if (!choice) {
        slots.push({ date, meal, candidate: null, servings: 0, macros: null, replaceIds: [], reason: 'No eligible recipe; existing meals stay unchanged.' });
        // Failed replacements still contribute their actual retained nutrition to later slots.
        planned = [...planned, ...existing.map((entry) => ({ recipeId: entry.recipeId, meal, servings: entry.servings, logged: entry.logged }))];
        continue;
      }
      const title = normalize(choice.candidate.title);
      usage.set(title, (usage.get(title) ?? 0) + 1);
      slots.push({
        date, meal, candidate: choice.candidate, servings: 1, macros: choice.macros, replaceIds: existing.map((entry) => entry.id),
        reason: `${existing.length ? 'Replace selected slot' : 'Fill empty slot'}; ${result.usedIntake ? 'today’s intake + unlogged plans' : 'planned meals only'}; ${result.incompletePlan ? 'some planned nutrition unknown; ' : ''}${choice.missing ? 'limited goal comparison' : 'variety, then available calorie/macro fit'}.`,
      });
      planned.push({ recipeId: choice.candidate.id, meal, servings: 1, logged: false });
    }
  }
  const additions = slots.filter((slot) => slot.candidate !== null);
  const replaceIds = new Set(additions.flatMap((slot) => slot.replaceIds));
  const finalEntries = input.entries.filter((entry) => !replaceIds.has(entry.id));
  const dailyTotals = dates.map((date) => {
    const macros = [
      ...finalEntries.filter((entry) => entry.date === date).map((entry) => ({ values: byId.has(entry.recipeId) ? candidateMacros(byId.get(entry.recipeId)!) : null, servings: entry.servings })),
      ...additions.filter((slot) => slot.date === date).map((slot) => ({ values: slot.macros, servings: slot.servings })),
    ];
    const totals = Object.fromEntries(MACRO_KEYS.map((key) => {
      const value = macros.reduce((sum, item) => {
        const n = item.values?.[key];
        return sum + (n != null && Number.isFinite(item.servings) && item.servings > 0 ? n * item.servings : NaN);
      }, 0);
      return [key, Number.isFinite(value) ? value : null];
    })) as KnownMacros;
    return { date, totals };
  });
  return { weekStart: input.weekStart, slots, dailyTotals, additions: additions.length, replaceIds: [...replaceIds] };
}

/** Reject stale previews before any writes, including newly occupied slots and edited portions/log status. */
export function mealPlanSnapshot(entries: readonly WeeklyEntry[]): string {
  return JSON.stringify([...entries].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((entry) => [
    entry.id, entry.date, entry.meal, entry.recipeId, entry.servings, entry.logged,
  ]));
}
