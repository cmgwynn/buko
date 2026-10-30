import { addDays, toDateString } from '../diary';
import type { FoodLogEntry, Goal, NutritionTargets, Profile } from '../../types';
import { CALORIE_FLOOR } from './targets';
import { isDateString } from '../dates';

export interface WeeklyNutritionInsight {
  loggedDays: number;
  days: 7;
  average: { calories: number; protein: number; carbs: number; fat: number } | null;
  target: { calories: number; protein: number; carbs: number; fat: number };
}

export function weeklyNutritionInsight(
  entries: Pick<FoodLogEntry, 'logged_on' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[],
  targets: NutritionTargets,
  endDate = toDateString(new Date()),
): WeeklyNutritionInsight {
  const start = addDays(endDate, -6);
  const byDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const entry of entries) {
    if (entry.logged_on < start || entry.logged_on > endDate) continue;
    const day = byDay.get(entry.logged_on) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    day.calories += Number(entry.calories);
    day.protein += Number(entry.protein_g);
    day.carbs += Number(entry.carbs_g);
    day.fat += Number(entry.fat_g);
    byDay.set(entry.logged_on, day);
  }
  const loggedDays = byDay.size;
  const average = loggedDays === 0 ? null : [...byDay.values()].reduce(
    (total, day) => ({
      calories: total.calories + day.calories / loggedDays,
      protein: total.protein + day.protein / loggedDays,
      carbs: total.carbs + day.carbs / loggedDays,
      fat: total.fat + day.fat / loggedDays,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    loggedDays,
    days: 7,
    average,
    target: { calories: targets.calories, protein: targets.protein_g, carbs: targets.carbs_g, fat: targets.fat_g },
  };
}

export interface WeightTrendPoint {
  date: string;
  value: number;
}

export type AdaptiveTargetSuggestion =
  | { status: 'insufficient'; reason: string }
  | { status: 'steady'; rateKgPerWeek: number; reason: string }
  | {
    status: 'suggestion';
    changeKcal: number;
    nextAdjustmentKcal: number;
    rateKgPerWeek: number;
    targetCalories: number;
    targetCarbsG: number;
    reason: string;
  };

const validPoint = (point: WeightTrendPoint) => isDateString(point.date)
  && Number.isFinite(point.value) && point.value >= 20 && point.value <= 500;

/** Bounded, opt-in target guidance; sparse intake or weight history never produces a change. */
export function adaptiveTargetSuggestion(input: {
  entries: Pick<FoodLogEntry, 'logged_on'>[];
  weights: WeightTrendPoint[];
  today: string;
  goal: Goal;
  sex: Profile['sex'];
  targets: NutritionTargets;
}): AdaptiveTargetSuggestion {
  const end = input.today;
  const start = addDays(end, -20);
  const trackedDays = new Set(input.entries
    .filter((entry) => entry.logged_on >= start && entry.logged_on <= end)
    .map((entry) => entry.logged_on)).size;
  if (trackedDays < 14) return { status: 'insufficient', reason: `Log food on at least 14 of the last 21 days before considering a target change (${trackedDays}/14 so far).` };

  const weights = input.weights.filter(validPoint)
    .filter((point) => point.date >= start && point.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length < 4 || weights[weights.length - 1].date < addDays(end, -3)
    || weights[weights.length - 1].date < addDays(weights[0].date, 14)) {
    return { status: 'insufficient', reason: 'Record at least four weights spanning 14 days, including one in the last three days, to view a trend.' };
  }

  const recent = weights.filter((point) => point.date >= addDays(end, -7));
  const earlier = weights.filter((point) => point.date >= addDays(end, -20) && point.date <= addDays(end, -7));
  if (!recent.length || !earlier.length) return { status: 'insufficient', reason: 'More recent weight readings are needed to compare two periods.' };
  const mean = (points: WeightTrendPoint[]) => points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const recentMean = mean(recent);
  const earlierMean = mean(earlier);
  const elapsedDays = Math.max(7, (Date.parse(`${recent[recent.length - 1].date}T00:00:00Z`) - Date.parse(`${earlier[0].date}T00:00:00Z`)) / 86_400_000);
  const rateKgPerWeek = (recentMean - earlierMean) / (elapsedDays / 7);
  const ratePercentPerWeek = rateKgPerWeek / recentMean * 100;
  const currentAdjustment = Math.max(-200, Math.min(200, Math.round(input.targets.adaptive_calorie_adjustment ?? 0)));
  let changeKcal = 0;
  let trendReason = 'Your recent trend is within the range where no change is suggested.';
  if (input.goal === 'lose') {
    if (ratePercentPerWeek > -0.1) {
      changeKcal = -100;
      trendReason = 'Your recent loss is slower than the conservative trend range.';
    } else if (ratePercentPerWeek < -1) {
      changeKcal = 100;
      trendReason = 'Your recent loss is faster than the conservative trend range.';
    }
  } else if (input.goal === 'gain') {
    if (ratePercentPerWeek < 0.1) {
      changeKcal = 100;
      trendReason = 'Your recent gain is slower than the conservative trend range.';
    } else if (ratePercentPerWeek > 0.5) {
      changeKcal = -100;
      trendReason = 'Your recent gain is faster than the conservative trend range.';
    }
  } else if (ratePercentPerWeek > 0.25) {
    changeKcal = -100;
    trendReason = 'Your recent gain is above the maintenance trend range.';
  } else if (ratePercentPerWeek < -0.25) {
    changeKcal = 100;
    trendReason = 'Your recent loss is above the maintenance trend range.';
  }

  const nextAdjustmentKcal = Math.max(-200, Math.min(200, currentAdjustment + changeKcal));
  const boundedChange = nextAdjustmentKcal - currentAdjustment;
  const floor = CALORIE_FLOOR[input.sex];
  const targetCalories = Math.max(floor, input.targets.calories + boundedChange);
  const actualChange = targetCalories - input.targets.calories;
  if (actualChange === 0) {
    return { status: 'steady', rateKgPerWeek, reason: 'Your recent trend does not call for a bounded adjustment right now. Keep logging consistently and review again later.' };
  }
  const targetCarbsG = Math.max(0, Math.round((targetCalories - input.targets.protein_g * 4 - input.targets.fat_g * 9) / 4));
  return {
    status: 'suggestion',
    changeKcal: actualChange,
    nextAdjustmentKcal: currentAdjustment + actualChange,
    rateKgPerWeek,
    targetCalories,
    targetCarbsG,
    reason: `${trendReason} Your recent weight trend is about ${Math.abs(rateKgPerWeek).toFixed(2)} kg/week ${rateKgPerWeek < 0 ? 'down' : 'up'}.`,
  };
}
