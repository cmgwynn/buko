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
  /** Defaults to the run-focused plan. Strength splits use preferredRunDays as training days. */
  split?: TrainingSplit;
  equipment?: TrainingEquipment;
  /** Strength splits only. */
  sessionsPerWeek?: number;
}
export type TrainingSplit = 'run' | 'full_body' | 'upper_lower' | 'ppl';
export type TrainingEquipment = 'bodyweight' | 'dumbbells' | 'gym';
export const TRAINING_SPLITS: { key: TrainingSplit; label: string; hint: string; sessions: [number, number]; defaultSessions: number }[] = [
  { key: 'run', label: 'Run + strength', hint: 'Easy runs with light strength', sessions: [1, 3], defaultSessions: 2 },
  { key: 'full_body', label: 'Full body', hint: 'Whole body each session', sessions: [2, 3], defaultSessions: 3 },
  { key: 'upper_lower', label: 'Upper / lower', hint: 'Alternate upper and lower days', sessions: [2, 4], defaultSessions: 4 },
  { key: 'ppl', label: 'Push / pull / legs', hint: 'Three-day rotation', sessions: [3, 6], defaultSessions: 3 },
];
export const TRAINING_EQUIPMENT: { key: TrainingEquipment; label: string }[] = [
  { key: 'bodyweight', label: 'No equipment' }, { key: 'dumbbells', label: 'Dumbbells' }, { key: 'gym', label: 'Full gym' },
];
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

type Pattern = 'squat' | 'hinge' | 'lunge' | 'hpush' | 'incline' | 'vpush' | 'hpull' | 'vpull' | 'lateral' | 'rear' | 'biceps' | 'triceps'
  | 'legCurl' | 'legExt' | 'calves' | 'core';
// Ordered preferences per equipment level; the first available, non-excluded exercise wins.
const PATTERNS: Record<Pattern, Record<TrainingEquipment, string[]>> = {
  squat: { gym: ['Back Squat', 'Leg Press', 'Goblet Squat'], dumbbells: ['Goblet Squat', 'Bulgarian Split Squat'], bodyweight: ['Bulgarian Split Squat', 'Lunge'] },
  hinge: { gym: ['Romanian Deadlift', 'Deadlift', 'Hip Thrust'], dumbbells: ['Glute Bridge'], bodyweight: ['Glute Bridge'] },
  lunge: { gym: ['Walking Lunge', 'Bulgarian Split Squat'], dumbbells: ['Walking Lunge', 'Step-Up'], bodyweight: ['Step-Up', 'Lunge'] },
  hpush: { gym: ['Barbell Bench Press', 'Machine Chest Press', 'Dumbbell Bench Press'], dumbbells: ['Dumbbell Bench Press', 'Push-Up'], bodyweight: ['Push-Up'] },
  incline: { gym: ['Incline Dumbbell Press', 'Incline Barbell Bench Press'], dumbbells: ['Incline Dumbbell Press', 'Dumbbell Fly'], bodyweight: ['Diamond Push-Up'] },
  vpush: { gym: ['Overhead Press', 'Dumbbell Shoulder Press'], dumbbells: ['Dumbbell Shoulder Press', 'Arnold Press'], bodyweight: ['Bench Dip'] },
  hpull: { gym: ['Seated Cable Row', 'Barbell Row'], dumbbells: ['Dumbbell Row'], bodyweight: [] },
  vpull: { gym: ['Lat Pulldown', 'Pull-Up'], dumbbells: ['Rear Delt Fly'], bodyweight: [] },
  lateral: { gym: ['Lateral Raise'], dumbbells: ['Lateral Raise'], bodyweight: [] },
  rear: { gym: ['Face Pull', 'Rear Delt Fly'], dumbbells: ['Rear Delt Fly'], bodyweight: [] },
  biceps: { gym: ['Cable Curl', 'Barbell Curl', 'Dumbbell Curl'], dumbbells: ['Dumbbell Curl', 'Hammer Curl'], bodyweight: [] },
  triceps: { gym: ['Triceps Pushdown', 'Skull Crusher'], dumbbells: ['Overhead Triceps Extension'], bodyweight: ['Bench Dip', 'Diamond Push-Up'] },
  legCurl: { gym: ['Lying Leg Curl', 'Seated Leg Curl'], dumbbells: [], bodyweight: [] },
  legExt: { gym: ['Leg Extension'], dumbbells: [], bodyweight: [] },
  calves: { gym: ['Standing Calf Raise', 'Seated Calf Raise'], dumbbells: [], bodyweight: [] },
  core: { gym: ['Cable Crunch', 'Hanging Leg Raise', 'Crunch'], dumbbells: ['Russian Twist', 'Crunch'], bodyweight: ['Crunch', 'Russian Twist'] },
};
const SESSIONS: Record<Exclude<TrainingSplit, 'run'>, { name: string; patterns: Pattern[] }[]> = {
  full_body: [
    { name: 'Full body A', patterns: ['squat', 'hpush', 'hpull', 'core'] },
    { name: 'Full body B', patterns: ['hinge', 'vpush', 'vpull', 'lunge'] },
  ],
  upper_lower: [
    { name: 'Upper body', patterns: ['hpush', 'hpull', 'vpush', 'vpull', 'biceps', 'triceps'] },
    { name: 'Lower body', patterns: ['squat', 'hinge', 'lunge', 'legCurl', 'calves', 'core'] },
  ],
  ppl: [
    { name: 'Push day', patterns: ['hpush', 'vpush', 'incline', 'lateral', 'triceps'] },
    { name: 'Pull day', patterns: ['hpull', 'vpull', 'rear', 'biceps'] },
    { name: 'Leg day', patterns: ['squat', 'hinge', 'lunge', 'legExt', 'legCurl', 'calves'] },
  ],
};
// 4-week block: build volume, then intensity, then deload.
const STRENGTH_WEEKS = [
  { sets: 2, reps: 10, note: 'Pick a weight you could lift 3 more times.', why: 'Learn the movements with room to spare.' },
  { sets: 3, reps: 10, note: 'Same weight, one more set.', why: 'More volume at the same weight.' },
  { sets: 3, reps: 8, note: 'Add a little weight if last week felt easy.', why: 'Slightly heavier, fewer reps.' },
  { sets: 2, reps: 8, note: 'Lighter week. Use week 1 weights.', why: 'Deload so you recover before the next block.' },
];
// Catalog equipment usable at each level; bar-dependent bodyweight moves are only listed under gym.
const EQUIPMENT_ALLOWED: Record<TrainingEquipment, (string | null)[]> = {
  bodyweight: ['bodyweight', null], dumbbells: ['bodyweight', 'dumbbell', null], gym: [],
};

function generateStrengthSplit(input: TrainingInput, split: Exclude<TrainingSplit, 'run'>, catalog: Exercise[], excludedIds: string[]): TrainingPreview {
  const option = TRAINING_SPLITS.find((item) => item.key === split)!;
  const sessionsPerWeek = input.sessionsPerWeek ?? option.defaultSessions;
  if (!Number.isInteger(sessionsPerWeek) || sessionsPerWeek < option.sessions[0] || sessionsPerWeek > option.sessions[1]) {
    throw new Error(`Choose ${option.sessions[0]} to ${option.sessions[1]} sessions per week for ${option.label}.`);
  }
  if (!input.preferredRunDays.length || input.preferredRunDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Choose at least one training day.');
  }
  const equipment = input.equipment ?? 'gym';
  const excluded = new Set(excludedIds);
  const byName = new Map(catalog.filter((exercise) => !excluded.has(exercise.id) && exercise.category === 'strength')
    .slice().sort((a, b) => a.id.localeCompare(b.id)).map((exercise) => [exercise.name.toLowerCase(), exercise] as const));
  const pick = (pattern: Pattern, used: Set<string>) => {
    // More equipment can always use the simpler options as fallbacks.
    const levels: TrainingEquipment[] = equipment === 'gym' ? ['gym', 'dumbbells', 'bodyweight'] : equipment === 'dumbbells' ? ['dumbbells', 'bodyweight'] : ['bodyweight'];
    for (const name of levels.flatMap((level) => PATTERNS[pattern][level])) {
      const exercise = byName.get(name.toLowerCase());
      if (exercise && !used.has(exercise.id) && (equipment === 'gym' || EQUIPMENT_ALLOWED[equipment].includes(exercise.equipment))) return exercise;
    }
    return null;
  };
  const templates = SESSIONS[split].map((session) => {
    const used = new Set<string>();
    const exercises = session.patterns.flatMap((pattern) => {
      const exercise = pick(pattern, used);
      if (!exercise) return [];
      used.add(exercise.id);
      return [exercise];
    });
    return { name: session.name, exercises };
  });
  const firstDay = new Date(`${input.startDate}T00:00:00Z`).getUTCDay();
  const days: number[] = [];
  for (let offset = 0; offset < 7 && days.length < sessionsPerWeek; offset++) {
    const day = (firstDay + offset) % 7;
    // Full-body sessions need a rest day between them; split routines alternate muscles instead.
    if (input.preferredRunDays.includes(day) && (split !== 'full_body' || days.every((other) => distance(day, other) >= 2))) days.push(day);
  }
  const rationale = [`${option.label}, ${days.length} day${days.length === 1 ? '' : 's'} a week, 4-week block: build, push, heavier, then a lighter week.`];
  if (days.length < sessionsPerWeek) rationale.push(`Only ${days.length} of your chosen days fit${split === 'full_body' ? ' with a rest day between sessions' : ''}. Pick more days for ${sessionsPerWeek}.`);
  if (templates.some((template) => template.exercises.length < SESSIONS[split].find((session) => session.name === template.name)!.patterns.length)) {
    rationale.push('Some moves were skipped because they need other equipment or you excluded them.');
  }
  let rotation = 0;
  const plan: TrainingDay[] = Array.from({ length: 28 }, (_, offset) => {
    const date = trainingAddDays(input.startDate, offset);
    const week = Math.floor(offset / 7);
    const weekday = (firstDay + offset) % 7;
    const template = days.includes(weekday) ? templates[rotation++ % templates.length] : null;
    if (!template || !template.exercises.length) {
      return { date, week: week + 1, kind: 'rest', name: 'Rest', notes: 'Rest, or an easy walk.', rationale: 'Recovery between sessions.', snapshot: [], save: false, replaceId: null };
    }
    const scheme = STRENGTH_WEEKS[week];
    return {
      date, week: week + 1, kind: 'strength', name: template.name,
      notes: `${scheme.sets} × ${scheme.reps}. ${scheme.note} Rest 1–2 min between sets.`,
      rationale: scheme.why,
      snapshot: template.exercises.map((exercise) => ({
        exercise,
        sets: Array.from({ length: scheme.sets }, (_, position) => targetSet(position,
          { reps: scheme.reps, weight_kg: exercise.equipment === 'bodyweight' ? 0 : null })),
        restSeconds: 90,
      })),
      save: true, replaceId: null,
    };
  });
  return { days: plan, rationale, exclusions: excludedIds.map((id) => catalog.find((exercise) => exercise.id === id)?.name ?? `Unavailable exercise (${id})`) };
}

/** Targets only, never training records. Ability is self-reported, not inferred from missing history. */
export function generateTrainingPlan(input: TrainingInput, catalog: Exercise[], excludedIds: string[], today: string): TrainingPreview {
  if (!Number.isFinite(trainingDate(input.startDate)) || !Number.isFinite(trainingDate(today)) || input.startDate < today) {
    throw new Error('Choose a valid start date today or later.');
  }
  if (input.split && input.split !== 'run') return generateStrengthSplit(input, input.split, catalog, excludedIds);
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
          // A blank load means "choose on the day".
          if ((!Number.isInteger(set.reps) || set.reps! < 1 || set.reps! > 100
            || (set.weight_kg != null && (!Number.isFinite(set.weight_kg) || set.weight_kg < 0 || set.weight_kg > 1500)))) {
            throw new Error('Strength targets need 1 to 100 whole reps and a valid nonnegative load.');
          }
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
