import type { Exercise, WorkoutSet } from './types';
import type { PlannedWorkoutRow } from './data';

export const TRAINING_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export interface TrainingInput {
  startDate: string;
  comfortableMinutes: number;
  comfortableRunsPerWeek: number;
  preferredRunDays: number[];
  runWalk: boolean;
  includeStrength: boolean;
}
export interface TrainingDay {
  date: string;
  week: number;
  kind: 'run' | 'strength' | 'rest';
  name: string;
  notes: string;
  rationale: string;
  snapshot: PlannedWorkoutRow['snapshot'];
  save: boolean;
  replaceId: string | null;
}
export interface TrainingPreview {
  days: TrainingDay[];
  rationale: string[];
  exclusions: string[];
}

export function trainingDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
}
export const trainingAddDays = (date: string, count: number) => new Date(trainingDate(date) + count * 86_400_000).toISOString().slice(0, 10);
const targetSet = (position: number, patch: Partial<WorkoutSet>): WorkoutSet => ({
  position, reps: null, weight_kg: null, duration_s: null, distance_m: null,
  is_warmup: false, completed: false, completed_at: null, rpe: null, ...patch,
});
const distance = (a: number, b: number) => Math.min((a - b + 7) % 7, (b - a + 7) % 7);

/** Targets only, never training records. Ability is self-reported, not inferred from missing history. */
export function generateTrainingPlan(input: TrainingInput, catalog: Exercise[], excludedIds: string[], today: string): TrainingPreview {
  if (!Number.isFinite(trainingDate(input.startDate)) || !Number.isFinite(trainingDate(today)) || input.startDate < today) {
    throw new Error('Choose a valid start date today or later.');
  }
  if (!Number.isFinite(input.comfortableMinutes) || input.comfortableMinutes < 5 || input.comfortableMinutes > 60) {
    throw new Error('Enter a comfortable easy session duration from 5 to 60 minutes.');
  }
  if (!Number.isInteger(input.comfortableRunsPerWeek) || input.comfortableRunsPerWeek < 1 || input.comfortableRunsPerWeek > 3) {
    throw new Error('Choose 1 to 3 comfortable run sessions per week.');
  }
  if (!input.preferredRunDays.length || input.preferredRunDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Choose at least one preferred run day.');
  }
  const excluded = new Set(excludedIds);
  const available = catalog.filter((exercise) => !excluded.has(exercise.id)).slice().sort((a, b) => a.id.localeCompare(b.id));
  const running = available.find((exercise) => exercise.category === 'cardio' && exercise.name.toLowerCase() === 'running');
  const strength = ['glute bridge', 'push-up', 'crunch'].flatMap((name) => {
    const exercise = available.find((candidate) => candidate.category === 'strength' && candidate.name.toLowerCase() === name);
    return exercise ? [exercise] : [];
  });
  const runDays: number[] = [];
  const firstDay = new Date(`${input.startDate}T00:00:00Z`).getUTCDay();
  for (let offset = 0; offset < 7; offset++) {
    const day = (firstDay + offset) % 7;
    if (running && input.preferredRunDays.includes(day) && runDays.length < input.comfortableRunsPerWeek
      && runDays.every((other) => distance(day, other) >= 2)) runDays.push(day);
  }
  const strengthDays: number[] = [];
  if (input.includeStrength && strength.length) {
    for (let offset = 0; offset < 7 && strengthDays.length < 2; offset++) {
      const day = (firstDay + offset) % 7;
      if (!runDays.includes(day) && strengthDays.every((other) => distance(day, other) >= 3)
        && (!running || runDays.length + strengthDays.length < 5)) strengthDays.push(day);
    }
  }
  const rationale = [
    'General fitness, not a race plan. All runs stay at an easy conversational effort; walk whenever needed. Stop for pain, dizziness or unusual breathlessness.',
    'Run frequency never exceeds your stated comfortable frequency or 3 days per week. Preferred days are spaced with at least one non-running day, including across weeks.',
    'Week 1 uses your comfortable duration. Weeks 2 and 3 increase duration by at most 5% each week; week 4 cuts back for recovery. Repeat or reduce a week if recovery is poor; progression is optional, not a guarantee of safety.',
    'Strength starts with one light bodyweight set per exercise, twice weekly at most, with at least two days between strength sessions. No load increases are prescribed.',
  ];
  if (runDays.length < new Set(input.preferredRunDays).size) rationale.push('Some preferred run days were left unused to respect spacing and your comfortable weekly frequency.');
  if (!running) rationale.push('Running is excluded or missing from your exercise library. No running sessions were created and no substitute was invented.');
  if (input.includeStrength && strength.length < 3) rationale.push('Some starter strength exercises are excluded or unavailable. Only available, non-excluded exercises are used.');
  const baseline = Math.floor(input.comfortableMinutes * 60);
  const secondWeek = Math.floor(baseline * 1.05);
  const durations = [baseline, secondWeek, Math.floor(secondWeek * 1.05), Math.floor(baseline * 0.85)];
  const days: TrainingDay[] = Array.from({ length: 28 }, (_, offset) => {
    const date = trainingAddDays(input.startDate, offset);
    const week = Math.floor(offset / 7);
    const weekday = (firstDay + offset) % 7;
    if (running && runDays.includes(weekday)) {
      const duration = durations[week];
      return {
        date, week: week + 1, kind: 'run', name: input.runWalk ? 'Easy run / walk' : 'Easy run',
        notes: `${Math.round(duration / 60 * 10) / 10} min total easy ${input.runWalk ? 'run/walk; alternate short comfortable jogs with walks as needed' : 'running; walking breaks welcome'}. Warm up and cool down with easy walking as needed, not included in the target. No pace or distance goal.`,
        rationale: week === 3 ? 'Recovery week: below your starting duration.' : week === 0 ? 'Starts at your self-reported comfortable duration, without adding frequency.' : 'At most 5% more easy time than the previous week; repeat or reduce if tired.',
        snapshot: [{ exercise: running, sets: [targetSet(0, { duration_s: duration })] }],
        save: true, replaceId: null,
      };
    }
    if (strengthDays.includes(weekday)) {
      return {
        date, week: week + 1, kind: 'strength', name: 'Light strength cross-training',
        notes: 'One easy set per exercise. Use comfortable range of motion, leave several reps in reserve, and skip painful movements. Rest as needed. These are editable starting targets, not a claim about your ability.',
        rationale: week === 2 ? 'If earlier sessions felt easy, try 7 instead of 6 reps; no added load.' : 'Low-volume bodyweight practice supports general strength without hard run sessions.',
        snapshot: strength.map((exercise) => ({ exercise, sets: [targetSet(0, { reps: week === 2 ? 7 : 6, weight_kg: 0 })], restSeconds: 90 })),
        save: true, replaceId: null,
      };
    }
    return { date, week: week + 1, kind: 'rest', name: 'Rest / gentle mobility', notes: 'Rest, or optional comfortable walking and mobility. No workout is saved for rest days.', rationale: 'Recovery between sessions.', snapshot: [], save: false, replaceId: null };
  });
  return { days, rationale, exclusions: excludedIds.map((id) => catalog.find((exercise) => exercise.id === id)?.name ?? `Unavailable exercise (${id})`) };
}

export interface TrainingSaveOperation {
  day: TrainingDay;
  replace: PlannedWorkoutRow | null;
}

/** Validate every selected slot before writing anything. Existing slots are skipped by default in the UI. */
export function prepareTrainingSave(
  days: TrainingDay[], current: PlannedWorkoutRow[], reviewed: PlannedWorkoutRow[],
  excludedIds: string[], userId: string, today: string, activePlanId?: string | null,
): TrainingSaveOperation[] {
  const selected = days.filter((day) => day.save && day.kind !== 'rest');
  if (!selected.length) throw new Error('Select at least one workout to save.');
  const replacements = new Set<string>();
  const dates = new Set<string>();
  return selected.map((day) => {
    if (!Number.isFinite(trainingDate(day.date)) || day.date < today || dates.has(day.date)) throw new Error('Choose distinct valid dates today or later for selected workouts.');
    dates.add(day.date);
    if (!day.name.trim() || day.name.length > 100 || day.notes.length > 2000 || !day.snapshot.length) throw new Error('Every selected workout needs a name, exercises and notes of at most 2,000 characters.');
    for (const item of day.snapshot) {
      if (excludedIds.includes(item.exercise.id)) throw new Error(`${item.exercise.name} is excluded. Regenerate or remove it before saving.`);
      if (!item.sets.length || item.sets.length > 5) throw new Error('Use 1 to 5 planned sets per exercise.');
      for (const set of item.sets) {
        if (set.completed || set.completed_at || set.is_warmup || set.rpe != null) throw new Error('Preview sets must be uncompleted working targets, without logged effort.');
        if (item.exercise.category === 'strength') {
          if (!Number.isInteger(set.reps) || set.reps! < 1 || set.reps! > 100 || set.weight_kg == null
            || !Number.isFinite(set.weight_kg) || set.weight_kg < 0 || set.weight_kg > 1500) throw new Error('Strength targets need 1 to 100 whole reps and a valid nonnegative load.');
        } else if (!Number.isInteger(set.duration_s) || set.duration_s! < 60 || set.duration_s! > 7200) {
          throw new Error('Run targets need a duration from 1 to 120 whole minutes.');
        }
      }
    }
    const replace = day.replaceId ? current.find((plan) => plan.id === day.replaceId) : null;
    if (current.some((plan) => plan.planned_for === day.date && !reviewed.some((before) => before.id === plan.id))) {
      throw new Error('A new plan now occupies a selected date. Regenerate the preview to review it first.');
    }
    if (day.replaceId) {
      const before = reviewed.find((plan) => plan.id === day.replaceId);
      if (!replace || !before || replacements.has(replace.id) || replace.user_id !== userId
        || replace.planned_for !== day.date || replace.completed_workout_id || replace.id === activePlanId
        || JSON.stringify(replace) !== JSON.stringify(before)) throw new Error('A selected replacement changed, was completed, or is active. Refresh the preview before saving.');
      replacements.add(replace.id);
    }
    return { day, replace: replace ?? null };
  });
}
