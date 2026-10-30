import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  generateTrainingPlan, prepareTrainingSave, trainingAddDays, trainingDate,
  type TrainingInput,
} from '../progression';
import type { Exercise } from '../types';
import type { PlannedWorkoutRow } from '../data';

const exercise = (id: string, name: string, category: 'strength' | 'cardio' = 'strength'): Exercise => ({
  id, name, category, user_id: null, muscle_groups: [], equipment: category === 'strength' ? 'bodyweight' : null, met: 4,
});
const catalog = [
  exercise('running', 'Running', 'cardio'), exercise('bridge', 'Glute Bridge'),
  exercise('push', 'Push-Up'), exercise('crunch', 'Crunch'),
];
const input: TrainingInput = {
  startDate: '2026-11-02', comfortableMinutes: 10, comfortableRunsPerWeek: 2,
  preferredRunDays: [1, 3, 6], runWalk: true, includeStrength: true,
};
const generate = (patch: Partial<TrainingInput> = {}, excluded: string[] = []) =>
  generateTrainingPlan({ ...input, ...patch }, catalog, excluded, '2026-10-29');
const existingPlan = (patch: Partial<PlannedWorkoutRow> = {}): PlannedWorkoutRow => ({
  id: 'existing', user_id: 'owner', planned_for: input.startDate, name: 'My routine',
  routine_id: 'routine', notes: 'Keep me', snapshot: [], completed_workout_id: null,
  updated_at: '2026-10-29T12:00:00Z', ...patch,
});

describe('deterministic general run + strength schedule', () => {
  it('creates four full preview weeks, no completed records, and does not mutate inputs', () => {
    const original = structuredClone({ input, catalog });
    const preview = generate();
    assert.equal(preview.days.length, 28);
    assert.equal(preview.days[0].date, '2026-11-02');
    assert.equal(preview.days.at(-1)?.date, '2026-11-29');
    assert.deepEqual(generate(), preview);
    assert.deepEqual({ input, catalog }, original);
    assert.match(preview.rationale.join(' '), /not a race/);
    for (const day of preview.days) {
      for (const item of day.snapshot) for (const set of item.sets) {
        assert.equal(set.completed, false);
        assert.equal(set.completed_at, null);
        assert.equal(set.rpe, null);
        assert.equal(set.is_warmup, false);
      }
    }
  });

  it('caps frequency at self-reported capacity and spaces runs across week boundaries', () => {
    for (const comfortableRunsPerWeek of [1, 2, 3]) {
      const days = generate({ preferredRunDays: [0, 1, 2, 3, 4, 5, 6], comfortableRunsPerWeek }).days;
      const runs = days.filter((day) => day.kind === 'run');
      assert.equal(runs.length, comfortableRunsPerWeek * 4);
      for (let index = 1; index < runs.length; index++) {
        assert.ok(trainingDate(runs[index].date) - trainingDate(runs[index - 1].date) >= 2 * 86_400_000);
      }
      assert.ok(days.filter((day) => day.kind === 'rest').length >= 8);
    }
  });

  it('uses only preferred run days even when this produces fewer sessions', () => {
    const preview = generate({ preferredRunDays: [1, 2], comfortableRunsPerWeek: 3 });
    assert.equal(preview.days.filter((day) => day.kind === 'run').length, 4);
    assert.ok(preview.days.filter((day) => day.kind === 'run').every((day) => new Date(`${day.date}T00:00:00Z`).getUTCDay() === 1));
    assert.match(preview.rationale.join(' '), /left unused/);
  });

  it('keeps weekly time growth <=5%, no added frequency, and a recovery week', () => {
    for (const comfortableMinutes of [5, 5.25, 10, 23, 60]) {
      const days = generate({ comfortableMinutes }).days;
      const totals = [1, 2, 3, 4].map((week) => days.filter((day) => day.week === week && day.kind === 'run')
        .reduce((sum, day) => sum + day.snapshot[0].sets[0].duration_s!, 0));
      assert.ok(totals[0] <= comfortableMinutes * 60 * input.comfortableRunsPerWeek);
      assert.ok(totals[1] <= totals[0] * 1.05);
      assert.ok(totals[2] <= totals[1] * 1.05);
      assert.ok(totals[3] < totals[0]);
    }
  });

  it('keeps strength light, spaced, optional and below five activity days per week', () => {
    const days = generate({ comfortableRunsPerWeek: 3 }).days;
    const strength = days.filter((day) => day.kind === 'strength');
    assert.equal(strength.length, 8);
    for (let index = 1; index < strength.length; index++) {
      assert.ok(trainingDate(strength[index].date) - trainingDate(strength[index - 1].date) >= 3 * 86_400_000);
    }
    strength.forEach((day) => day.snapshot.forEach((item) => {
      assert.equal(item.sets.length, 1);
      assert.equal(item.sets[0].weight_kg, 0);
      assert.ok(item.sets[0].reps! <= 7);
    }));
    assert.equal(generate({ includeStrength: false }).days.filter((day) => day.kind === 'strength').length, 0);
  });

  it('applies account exclusions without substitutions, catalog writes or fabricated exercises', () => {
    const preview = generate({}, ['running', 'push', 'unknown']);
    assert.equal(preview.days.some((day) => day.kind === 'run'), false);
    assert.equal(preview.days.some((day) => day.snapshot.some((item) => item.exercise.id === 'push')), false);
    assert.deepEqual(preview.exclusions, ['Running', 'Push-Up', 'Unavailable exercise (unknown)']);
    assert.match(preview.rationale.join(' '), /No running sessions/);
    const empty = generateTrainingPlan(input, [], [], '2026-10-29');
    assert.ok(empty.days.every((day) => day.kind === 'rest'));
    assert.equal(empty.days.flatMap((day) => day.snapshot).length, 0);
  });

  it('validates ability, preferred days and real future calendar dates', () => {
    for (const patch of [
      { startDate: '2026-02-30' }, { startDate: '2026-10-28' }, { startDate: 'bad' },
      { comfortableMinutes: NaN }, { comfortableMinutes: 0 }, { comfortableMinutes: 61 },
      { comfortableRunsPerWeek: 0 }, { comfortableRunsPerWeek: 4 }, { comfortableRunsPerWeek: 1.5 },
      { preferredRunDays: [] }, { preferredRunDays: [7] }, { preferredRunDays: [1.5] },
    ]) assert.throws(() => generate(patch));
    assert.equal(trainingAddDays('2026-12-31', 1), '2027-01-01');
    assert.equal(trainingAddDays('2028-02-28', 1), '2028-02-29');
    assert.ok(Number.isNaN(trainingDate('2026-02-29')));
  });

  it('uses continuous easy running only when requested, without pace or race targets', () => {
    const running = generate({ runWalk: false }).days.find((day) => day.kind === 'run')!;
    assert.equal(running.name, 'Easy run');
    assert.match(running.notes, /walking breaks welcome/);
    assert.equal(running.snapshot[0].sets[0].distance_m, null);
  });
});

describe('preview save safety', () => {
  const selected = () => generate().days.map((day, index) => ({ ...day, save: index === 0 }));
  const prepare = (days = selected(), current: PlannedWorkoutRow[] = [], reviewed = current, exclusions: string[] = [], activePlanId?: string) =>
    prepareTrainingSave(days, current, reviewed, exclusions, 'owner', '2026-10-29', activePlanId);

  it('creates new slots without changing existing plans by default', () => {
    const existing = existingPlan();
    const before = structuredClone(existing);
    const operations = prepare(selected(), [existing]);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].replace, null);
    assert.deepEqual(existing, before);
  });

  it('replaces only an explicitly selected unchanged uncompleted slot', () => {
    const days = selected();
    days[0].replaceId = 'existing';
    const current = [existingPlan(), existingPlan({ id: 'preserve' })];
    const operations = prepare(days, current);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].replace?.id, 'existing');
  });

  it('rejects completed, active, missing, moved or changed replacements', () => {
    for (const patch of [
      { completed_workout_id: 'completed' }, { user_id: 'other' },
      { planned_for: '2026-11-03' }, { updated_at: 'later' },
    ]) {
      const days = selected();
      days[0].replaceId = 'existing';
      assert.throws(() => prepare(days, [existingPlan(patch)], [existingPlan()]));
    }
    const days = selected();
    days[0].replaceId = 'existing';
    assert.throws(() => prepare(days, [], [existingPlan()]));
    assert.throws(() => prepare(days, [existingPlan()], [existingPlan()], [], 'existing'));
  });

  it('rejects newly occupied dates and validates every slot before any writes', () => {
    assert.throws(() => prepare(selected(), [existingPlan()], []), /new plan/);
    const days = selected();
    days[2].save = true;
    days[2].date = days[0].date;
    assert.throws(() => prepare(days), /distinct valid dates/);
    assert.throws(() => prepare(selected().map((day) => ({ ...day, save: false }))), /Select at least/);
  });

  it('rechecks exclusions and invalid edited targets instead of silently coercing', () => {
    assert.throws(() => prepare(selected(), [], [], ['running']), /excluded/);
    for (const duration_s of [null, NaN, 0, 59, 7201, 60.5]) {
      const days = selected();
      days[0].snapshot[0].sets[0].duration_s = duration_s;
      assert.throws(() => prepare(days), /duration/);
    }
    for (const patch of [{ completed: true }, { completed_at: 'now' }, { is_warmup: true }, { rpe: 7 }]) {
      const days = selected();
      Object.assign(days[0].snapshot[0].sets[0], patch);
      assert.throws(() => prepare(days), /uncompleted working targets/);
    }
    const days = generate().days.map((day) => ({ ...day, save: day.kind === 'strength' }));
    const strength = days.find((day) => day.kind === 'strength')!;
    strength.snapshot[0].sets[0].reps = 2.5;
    assert.throws(() => prepare(days), /whole reps/);
  });
});

describe('strength split types', () => {
  const gym = (id: string, name: string, equipment: string): Exercise => ({ ...exercise(id, name), equipment });
  const full = [
    gym('squat', 'Back Squat', 'barbell'), gym('goblet', 'Goblet Squat', 'dumbbell'), gym('bench', 'Barbell Bench Press', 'barbell'),
    gym('dbbench', 'Dumbbell Bench Press', 'dumbbell'), gym('row', 'Seated Cable Row', 'cable'), gym('dbrow', 'Dumbbell Row', 'dumbbell'),
    gym('ohp', 'Overhead Press', 'barbell'), gym('dbohp', 'Dumbbell Shoulder Press', 'dumbbell'), gym('pulldown', 'Lat Pulldown', 'cable'),
    gym('pullup', 'Pull-Up', 'bodyweight'), gym('rdl', 'Romanian Deadlift', 'barbell'), gym('lunge', 'Walking Lunge', 'dumbbell'),
    gym('plank', 'Plank', 'bodyweight'), gym('pushup', 'Push-Up', 'bodyweight'), gym('bridge', 'Glute Bridge', 'bodyweight'),
    gym('curl', 'Dumbbell Curl', 'dumbbell'), gym('pushdown', 'Triceps Pushdown', 'cable'), gym('lateral', 'Lateral Raise', 'dumbbell'),
    gym('stepup', 'Step-Up', 'dumbbell'), gym('dip', 'Bench Dip', 'bodyweight'),
  ];
  const split = (patch: Partial<TrainingInput>, excluded: string[] = []) =>
    generateTrainingPlan({ ...input, preferredRunDays: [1, 2, 3, 4, 5], ...patch }, full, excluded, '2026-10-29');

  it('rotates push / pull / legs across chosen days and progresses over four weeks', () => {
    const plan = split({ split: 'ppl', sessionsPerWeek: 3, equipment: 'gym' });
    const sessions = plan.days.filter((day) => day.kind === 'strength');
    assert.equal(sessions.length, 12);
    assert.deepEqual(sessions.slice(0, 4).map((day) => day.name), ['Push day', 'Pull day', 'Leg day', 'Push day']);
    assert.equal(sessions[0].snapshot[0].exercise.name, 'Barbell Bench Press');
    assert.equal(sessions[0].snapshot[0].sets.length, 2);
    assert.equal(sessions[3].snapshot[0].sets.length, 3);
    assert.equal(sessions.at(-1)!.snapshot[0].sets.length, 2);
    assert.doesNotThrow(() => prepareTrainingSave(plan.days, [], [], [], 'owner', '2026-10-29', null));
  });

  it('full body keeps a rest day between sessions and alternates A/B', () => {
    const plan = split({ split: 'full_body', sessionsPerWeek: 3 });
    const week = plan.days.slice(0, 7).filter((day) => day.kind === 'strength');
    assert.deepEqual(week.map((day) => day.date), ['2026-11-02', '2026-11-04', '2026-11-06']);
    assert.deepEqual(week.map((day) => day.name), ['Full body A', 'Full body B', 'Full body A']);
    assert.ok(week.every((day) => day.snapshot.every((item) => item.sets.every((set) => Number.isInteger(set.reps)))));
  });

  it('respects equipment and exclusions', () => {
    const plan = split({ split: 'upper_lower', sessionsPerWeek: 2, equipment: 'dumbbells' }, ['dbbench']);
    const names = plan.days.flatMap((day) => day.snapshot.map((item) => item.exercise.name));
    assert.ok(names.includes('Goblet Squat'));
    assert.ok(!names.includes('Back Squat'));
    assert.ok(!names.includes('Dumbbell Bench Press'));
    assert.ok(names.includes('Push-Up'));
    assert.ok(!names.includes('Romanian Deadlift'));
    const noKit = split({ split: 'ppl', equipment: 'bodyweight' }).days.flatMap((day) => day.snapshot.map((item) => item.exercise));
    assert.ok(noKit.length > 0);
    assert.ok(noKit.every((exercise) => exercise.equipment === 'bodyweight' || exercise.equipment === null));
    assert.ok(!noKit.some((exercise) => /pull-up|chin-up/i.test(exercise.name)));
  });

  it('validates sessions per split', () => {
    assert.throws(() => split({ split: 'full_body', sessionsPerWeek: 5 }), /2 to 3 sessions/);
    assert.throws(() => split({ split: 'ppl', preferredRunDays: [] }), /training day/);
  });
});
