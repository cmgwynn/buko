import { addLocalDays, mondayOfWeek, parseLocalDate } from '../dates';
import type { WorkoutSet } from '../fitness/types';

export type Feel = 'easy' | 'right' | 'hard';
export type TrainingMode = 'ease' | 'hold' | 'progress';

/** On Sunday review the week ending today; otherwise review last week. */
export function reviewWeek(today: string): { start: string; end: string; next: string } {
  const monday = mondayOfWeek(today);
  const start = parseLocalDate(today).getDay() === 0 ? monday : addLocalDays(monday, -7);
  return { start, end: addLocalDays(start, 6), next: addLocalDays(start, 7) };
}

/** Prompt only Sunday through Tuesday so the card never nags all week. */
export const checkinPromptDay = (today: string) => [0, 1, 2].includes(parseLocalDate(today).getDay());

export interface WeekSummary {
  workoutsPlanned: number;
  workoutsDone: number;
  foodDays: number;
  mealsPlanned: number;
  mealsEaten: number;
}

export function summarizeWeek(input: {
  start: string;
  end: string;
  planned: readonly { planned_for: string; completed_workout_id: string | null }[];
  foodLogDates: readonly string[];
  mealPlan: readonly { planned_on: string; logged_at: string | null }[];
}): WeekSummary {
  const within = (date: string) => date >= input.start && date <= input.end;
  const planned = input.planned.filter((row) => within(row.planned_for));
  const meals = input.mealPlan.filter((row) => within(row.planned_on));
  return {
    workoutsPlanned: planned.length,
    workoutsDone: planned.filter((row) => row.completed_workout_id).length,
    foodDays: new Set(input.foodLogDates.filter(within)).size,
    mealsPlanned: meals.length,
    mealsEaten: meals.filter((row) => row.logged_at).length,
  };
}

export function trainingAdvice(summary: WeekSummary, feel: Feel | null): { mode: TrainingMode; title: string; reason: string } | null {
  if (!summary.workoutsPlanned) return null;
  const rate = summary.workoutsDone / summary.workoutsPlanned;
  if (feel === 'hard' || rate < 0.5) {
    return { mode: 'ease', title: 'Ease off a little', reason: feel === 'hard' ? 'Last week felt hard.' : `You finished ${summary.workoutsDone} of ${summary.workoutsPlanned} workouts.` };
  }
  if (feel === 'easy' && rate >= 0.8) return { mode: 'progress', title: 'Step it up', reason: 'You finished almost everything and it felt easy.' };
  return { mode: 'hold', title: 'Stay the course', reason: rate >= 0.8 ? 'Great consistency. Your plan already ramps up gradually.' : 'Solid week. Keep building the habit.' };
}

const roundTo30 = (seconds: number) => Math.max(60, Math.round(seconds / 30) * 30);

/** Cardio time moves ±10–15%; strength drops one working set (ease) or adds a rep (progress). */
export function adjustSnapshot<T extends { exercise: { category: string }; sets: WorkoutSet[] }>(snapshot: readonly T[], mode: TrainingMode): T[] {
  if (mode === 'hold') return snapshot.map((item) => ({ ...item, sets: item.sets.map((set) => ({ ...set })) }));
  return snapshot.map((item) => {
    if (item.exercise.category === 'cardio') {
      const factor = mode === 'ease' ? 0.85 : 1.1;
      return { ...item, sets: item.sets.map((set) => set.duration_s && set.duration_s > 0 && !set.is_warmup ? { ...set, duration_s: roundTo30(set.duration_s * factor) } : { ...set }) };
    }
    if (mode === 'ease') {
      const working = item.sets.filter((set) => !set.is_warmup);
      if (working.length <= 2) return { ...item, sets: item.sets.map((set) => ({ ...set })) };
      const drop = item.sets.lastIndexOf(working[working.length - 1]);
      return { ...item, sets: item.sets.filter((_, index) => index !== drop).map((set, position) => ({ ...set, position })) };
    }
    return { ...item, sets: item.sets.map((set) => !set.is_warmup && set.reps != null && set.reps > 0 ? { ...set, reps: Math.min(30, set.reps + 1) } : { ...set }) };
  });
}

export function mealAdvice(summary: WeekSummary): string | null {
  if (summary.mealsPlanned >= 7 && summary.mealsEaten / summary.mealsPlanned < 0.5) {
    return `You ate ${summary.mealsEaten} of ${summary.mealsPlanned} planned meals. Try planning just dinners next week.`;
  }
  if (summary.foodDays < 4) return 'Log food on at least 4 days so Buko can fine-tune your calories.';
  return null;
}
