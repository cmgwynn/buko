import { addDays } from '../diary';
import { calculateTargets, type TargetInput } from '../nutrition/targets';
import { weekStart } from '../recipes/week';
import type { Exercise, WorkoutSet } from './types';

/** A set tied to the day it was performed, for history queries. */
export interface DatedSet {
  date: string; // YYYY-MM-DD, local
  reps: number | null;
  weight_kg: number | null;
  is_warmup: boolean;
}

const isWorkingSet = (s: { reps: number | null; weight_kg: number | null; is_warmup: boolean }) =>
  !s.is_warmup && (s.reps ?? 0) > 0 && (s.weight_kg ?? 0) > 0;

/**
 * Estimated one-rep max, Epley formula (1985): weight x (1 + reps / 30). A single rep is its own max.
 * It is an estimate and gets less reliable above roughly 10 reps, so we use it only to compare sets.
 */
export const estimateOneRepMax = (weightKg: number, reps: number): number => (reps <= 1 ? weightKg : weightKg * (1 + reps / 30));

export const setVolume = (s: { reps: number | null; weight_kg: number | null }): number => (s.reps ?? 0) * (s.weight_kg ?? 0);

export interface PersonalRecords {
  /** Heaviest weight lifted for at least one rep, with the reps it was done for. */
  heaviest: { weight_kg: number; reps: number; date: string } | null;
  /** Best estimated one-rep max. */
  bestOneRepMax: { value: number; weight_kg: number; reps: number; date: string } | null;
  /** Most volume (reps x weight) in a single set. */
  bestSetVolume: { value: number; weight_kg: number; reps: number; date: string } | null;
}

/**
 * Personal records for one exercise. Warm-up sets and sets without weight or reps are ignored.
 * Sets are visited oldest first and a record must be strictly beaten, so a tie keeps the earlier date.
 */
export function personalRecords(sets: DatedSet[]): PersonalRecords {
  const out: PersonalRecords = { heaviest: null, bestOneRepMax: null, bestSetVolume: null };
  const ordered = [...sets].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const s of ordered) {
    if (!isWorkingSet(s)) continue;
    const w = s.weight_kg as number;
    const r = s.reps as number;
    if (!out.heaviest || w > out.heaviest.weight_kg || (w === out.heaviest.weight_kg && r > out.heaviest.reps)) {
      out.heaviest = { weight_kg: w, reps: r, date: s.date };
    }
    const e = estimateOneRepMax(w, r);
    if (!out.bestOneRepMax || e > out.bestOneRepMax.value + 1e-9) out.bestOneRepMax = { value: e, weight_kg: w, reps: r, date: s.date };
    const v = w * r;
    if (!out.bestSetVolume || v > out.bestSetVolume.value + 1e-9) out.bestSetVolume = { value: v, weight_kg: w, reps: r, date: s.date };
  }
  return out;
}

export type RecordKind = 'heaviest' | 'oneRepMax' | 'setVolume';

/**
 * Which records a set would break compared with earlier history, for the "new PR" badge.
 * The very first working set for an exercise is a baseline, not a record, so it returns nothing.
 */
export function newRecordsFor(history: DatedSet[], set: WorkoutSet): RecordKind[] {
  if (!isWorkingSet(set)) return [];
  const prior = personalRecords(history);
  if (!prior.heaviest || !prior.bestOneRepMax || !prior.bestSetVolume) return [];
  const w = set.weight_kg as number;
  const r = set.reps as number;
  const out: RecordKind[] = [];
  if (w > prior.heaviest.weight_kg) out.push('heaviest');
  if (estimateOneRepMax(w, r) > prior.bestOneRepMax.value + 1e-9) out.push('oneRepMax');
  if (w * r > prior.bestSetVolume.value + 1e-9) out.push('setVolume');
  return out;
}

export interface WeeklyVolume {
  weekStart: string;
  volumeKg: number;
  sets: number;
}

/** Total weight lifted per week (sum of reps x weight over working sets), oldest first, including empty weeks. */
export function weeklyVolume(sets: DatedSet[], weeks: number, today: string): WeeklyVolume[] {
  const thisWeek = weekStart(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDays(thisWeek, -7 * (weeks - 1 - i)));
  const byWeek = new Map<string, WeeklyVolume>(starts.map((s) => [s, { weekStart: s, volumeKg: 0, sets: 0 }]));
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    const bucket = byWeek.get(weekStart(s.date));
    if (!bucket) continue;
    bucket.volumeKg += setVolume(s);
    bucket.sets += 1;
  }
  return starts.map((s) => byWeek.get(s)!);
}

/**
 * Working sets per muscle group. Each set counts once, for the exercise's first-listed (primary) muscle group,
 * which keeps the numbers easy to explain.
 */
export function setsByMuscle(items: { exercise: Pick<Exercise, 'muscle_groups' | 'category'>; sets: Pick<WorkoutSet, 'reps' | 'is_warmup'>[] }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { exercise, sets } of items) {
    if (exercise.category !== 'strength') continue;
    const primary = exercise.muscle_groups[0];
    if (!primary) continue;
    const n = sets.filter((s) => !s.is_warmup && (s.reps ?? 0) > 0).length;
    if (n) out[primary] = (out[primary] ?? 0) + n;
  }
  return out;
}

export interface WeightPoint {
  date: string;
  value: number;
}

/**
 * Trailing 7-day moving average of body weight, evaluated on each day that has a reading.
 * The window is calendar-based (that day and the six before it), so gaps do not distort it, and early
 * points average whatever readings exist. This smooths out day-to-day water-weight swings.
 */
export function movingAverage7(points: WeightPoint[]): WeightPoint[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted.map((p) => {
    const from = addDays(p.date, -6);
    const win = sorted.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, value: win.reduce((s, q) => s + q.value, 0) / win.length };
  });
}

/**
 * Estimated calories burned: MET x body weight (kg) x hours, the standard Compendium of Physical Activities
 * method. It is a rough estimate (it ignores fitness level and intensity changes) and the app labels it as one.
 */
export function estimateCalories(met: number, weightKg: number, minutes: number): number {
  return Math.round(met * weightKg * (minutes / 60));
}

/** Rough duration for a strength workout the user did not time: about 2.5 minutes per working set, at least 5. */
export const estimateStrengthMinutes = (workingSets: number): number => Math.max(5, Math.round(workingSets * 2.5));

export interface AdjustedTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Baseline calories before any activity was added. */
  baseCalories: number;
  /** Calories added for activity (share x burned). */
  bonusKcal: number;
  floorApplied: boolean;
}

/**
 * Daily target when "adjust for activity" is on.
 *
 * The normal target already includes an activity multiplier from onboarding, so adding burned calories on top
 * would count activity twice. Instead we start from the sedentary baseline (BMR x 1.2) for the user's goal, then
 * add `share` (default 50%) of the calories actually burned that day. The calorie floor still applies.
 */
export function activityAdjustedTargets(input: TargetInput, activeKcal: number, share: number): AdjustedTargets {
  const base = calculateTargets({ ...input, activityLevel: 'sedentary' });
  const bonus = Math.max(0, Math.round(activeKcal * Math.min(1, Math.max(0, share))));
  const calories = base.calories + bonus;
  // Same split as the normal target: protein by body weight, 25% of calories from fat, the rest carbs.
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - base.proteinG * 4 - fat * 9) / 4));
  return { calories, protein_g: base.proteinG, carbs_g: carbs, fat_g: fat, baseCalories: base.calories, bonusKcal: bonus, floorApplied: base.floorApplied };
}
