import { estimateCalories, estimateStrengthMinutes } from '../fitness/calc';
import type { Exercise, WorkoutSet } from '../fitness/types';

export interface PlannedSession {
  planned_for: string;
  snapshot: readonly { exercise: Pick<Exercise, 'name' | 'category' | 'met'>; sets: readonly Pick<WorkoutSet, 'is_warmup' | 'duration_s'>[] }[];
}
export interface MacroTargets { calories: number; protein_g: number; carbs_g: number; fat_g: number }
export type DayKind = 'run' | 'cardio' | 'strength' | 'mixed' | 'rest';
export interface FuelDay { date: string; kind: DayKind; workoutKcal: number; shiftKcal: number; targets: MacroTargets }

/** Share of estimated workout energy moved onto the training day, matching the Diary's default activity share. */
const SHARE = 0.5;
const MAX_BOOST_G = 125; // 500 kcal of carbs
const MAX_REST_CUT_G = 37; // ~150 kcal

export function sessionKcal(session: PlannedSession, weightKg: number): number {
  return session.snapshot.reduce((sum, item) => {
    const working = item.sets.filter((set) => !set.is_warmup);
    const minutes = item.exercise.category === 'cardio'
      ? working.reduce((m, set) => m + (set.duration_s && set.duration_s > 0 ? set.duration_s / 60 : 0), 0)
      : working.length ? estimateStrengthMinutes(working.length) : 0;
    const met = Number.isFinite(item.exercise.met) && item.exercise.met > 0 ? item.exercise.met : 0;
    return sum + (minutes > 0 ? estimateCalories(met, weightKg, minutes) : 0);
  }, 0);
}

function kindOf(sessions: readonly PlannedSession[]): DayKind {
  const items = sessions.flatMap((session) => session.snapshot);
  if (!items.length) return 'rest';
  const cardio = items.filter((item) => item.exercise.category === 'cardio');
  const strength = items.length - cardio.length;
  if (cardio.length && strength) return 'mixed';
  if (strength) return 'strength';
  return cardio.some((item) => /\b(run|running|jog)/i.test(item.exercise.name)) ? 'run' : 'cardio';
}

/**
 * Moves energy toward training days without changing the weekly total: the saved target already averages
 * activity across the week, so rest days give back what training days gain. Only carbs move.
 */
export function fuelWeek(dates: readonly string[], sessions: readonly PlannedSession[], base: MacroTargets, weightKg: number): FuelDay[] {
  const days = dates.map((date) => {
    const today = sessions.filter((session) => session.planned_for === date);
    const workoutKcal = today.reduce((sum, session) => sum + sessionKcal(session, weightKg), 0);
    return { date, kind: kindOf(today), workoutKcal, wantedG: Math.min(MAX_BOOST_G, Math.round(workoutKcal * SHARE / 4)) };
  });
  // Work in whole grams of carbs so calories and carbs both stay exactly weekly-neutral.
  const restCount = days.filter((day) => day.kind === 'rest').length;
  const restCap = Math.max(0, Math.min(MAX_REST_CUT_G, Math.floor(base.carbs_g)));
  const wanted = days.reduce((sum, day) => sum + (day.kind === 'rest' ? 0 : day.wantedG), 0);
  const budget = Math.min(wanted, restCount * restCap);
  const exact = days.map((day) => day.kind === 'rest' || !wanted ? 0 : day.wantedG * budget / wanted);
  const boosts = exact.map(Math.floor);
  // Largest remainder keeps the whole budget without exceeding it.
  const order = exact.map((value, index) => ({ index, rest: value - boosts[index] })).sort((x, y) => y.rest - x.rest || x.index - y.index);
  for (let left = budget - boosts.reduce((sum, value) => sum + value, 0), i = 0; left > 0; left--, i++) boosts[order[i].index]++;
  const boosted = budget;
  let restIndex = 0;
  return days.map((day, index) => {
    const grams = day.kind === 'rest'
      ? -(Math.floor(boosted / restCount) + (restIndex++ < boosted % restCount ? 1 : 0))
      : boosts[index];
    return {
      date: day.date, kind: day.kind, workoutKcal: day.workoutKcal, shiftKcal: grams * 4,
      targets: { ...base, calories: base.calories + grams * 4, carbs_g: base.carbs_g + grams },
    };
  });
}

const LABEL: Record<DayKind, string> = { run: 'Run day', cardio: 'Cardio day', strength: 'Strength day', mixed: 'Run + strength', rest: 'Rest day' };
export function fuelLabel(day: Pick<FuelDay, 'kind' | 'shiftKcal'>): string {
  if (!day.shiftKcal) return LABEL[day.kind];
  return `${LABEL[day.kind]} · ${day.shiftKcal > 0 ? '+' : '−'}${Math.abs(day.shiftKcal)} kcal`;
}
