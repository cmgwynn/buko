import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { STARTER_WORKOUTS, starterWorkoutExercises } from '../library';
import { fromDisplayDistance, fromDisplayWeight } from '../format';
import { routineExerciseForm, validateRoutine, type RoutineExercise } from '../routines';
import type { Exercise } from '../types';

const strength: Exercise = { id: 'strength', user_id: null, name: 'Push-Up', category: 'strength', muscle_groups: ['chest'], equipment: null, met: 5 };
const cardio: Exercise = { ...strength, id: 'cardio', name: 'Walking', category: 'cardio', muscle_groups: ['cardio'] };
const item = (exercise = strength): RoutineExercise => ({
  exercise, sets: 3, reps: exercise.category === 'strength' ? 8 : null,
  weightKg: null, durationS: exercise.category === 'cardio' ? 600 : null, distanceM: null,
});
const form = () => routineExerciseForm(item(), 'metric', 'one');

describe('routine editing', () => {
  it('preserves original precision when rounded metric or imperial fields are unchanged', () => {
    for (const units of ['metric', 'imperial'] as const) {
      for (const original of [
        { ...item(), id: 'saved', weightKg: 12.345678, durationS: 91 },
        { ...item(cardio), id: 'saved', distanceM: 1, durationS: 61 },
        { ...item(cardio), distanceM: 1609.344, durationS: 600 },
      ]) {
        assert.deepEqual(validateRoutine('Routine', [routineExerciseForm(original, units, 'x')], units)[0], original);
      }
    }
  });
  it('converts edited imperial values to metric and rounds seconds, accepting comma decimals', () => {
    const lifting = routineExerciseForm(item(), 'imperial', 'one');
    const walking = routineExerciseForm(item(cardio), 'imperial', 'two');
    const [a, b] = validateRoutine('Routine', [
      { ...lifting, weight: '25', reps: '12', sets: '2', minutes: '1,5' },
      { ...walking, distance: '1.5', minutes: '20' },
    ], 'imperial');
    assert.equal(a.weightKg, fromDisplayWeight(25, 'imperial'));
    assert.equal(a.durationS, 90);
    assert.equal(a.sets, 2);
    assert.equal(a.reps, 12);
    assert.equal(b.distanceM, fromDisplayDistance(1.5, 'imperial'));
    assert.equal(b.durationS, 1200);
  });
  it('supports clearing optional values, bodyweight zero, and distance-only cardio', () => {
    const original = { ...item(), weightKg: 50, durationS: 60 };
    const cleared = validateRoutine('Routine', [{ ...routineExerciseForm(original, 'metric', 'x'), weight: '', reps: '', minutes: '' }], 'metric')[0];
    assert.equal(cleared.weightKg, null);
    assert.equal(cleared.reps, null);
    assert.equal(cleared.durationS, null);
    assert.equal(validateRoutine('Routine', [{ ...form(), weight: '0' }], 'metric')[0].weightKg, 0);
    const walk = routineExerciseForm(item(cardio), 'metric', 'walk');
    assert.equal(validateRoutine('Walk', [{ ...walk, minutes: '', distance: '2' }], 'metric')[0].distanceM, 2000);
  });
  it('rejects missing/long names, empty routines and invalid targets', () => {
    assert.throws(() => validateRoutine(' ', [form()], 'metric'), /name/);
    assert.throws(() => validateRoutine('a'.repeat(101), [form()], 'metric'), /name/);
    assert.throws(() => validateRoutine('Routine', [], 'metric'), /exercise/);
    for (const sets of ['', '0', '51', '1.5', 'NaN', 'Infinity', '-1']) {
      assert.throws(() => validateRoutine('Routine', [{ ...form(), sets }], 'metric'), /set/);
    }
    for (const patch of [{ reps: '0' }, { reps: '1001' }, { reps: '1.5' }, { weight: '-1' }, { weight: '1500.1' }, { minutes: '0' }, { minutes: '1441' }]) {
      assert.throws(() => validateRoutine('Routine', [{ ...form(), ...patch }], 'metric'));
    }
    const walk = routineExerciseForm(item(cardio), 'metric', 'walk');
    assert.throws(() => validateRoutine('Walk', [{ ...walk, minutes: '', distance: '' }], 'metric'), /duration or distance/);
    assert.throws(() => validateRoutine('Walk', [{ ...walk, distance: '0' }], 'metric'), /distance/);
  });
  it('keeps order and identities after reordering/removing, without mutating originals', () => {
    const a = routineExerciseForm({ ...item(), id: 'a' }, 'metric', 'a');
    const b = routineExerciseForm({ ...item(cardio), id: 'b' }, 'metric', 'b');
    const result = validateRoutine('Routine', [b, { ...a, reps: '15' }], 'metric');
    assert.deepEqual(result.map((x) => x.id), ['b', 'a']);
    assert.equal(a.original.reps, 8);
    assert.deepEqual(validateRoutine('Routine', [b], 'metric').map((x) => x.id), ['b']);
  });
});

describe('starter workouts', () => {
  const migration = readFileSync(new URL('../../../../supabase/migrations/0003_fitness.sql', import.meta.url), 'utf8');
  const names = [...new Set(STARTER_WORKOUTS.flatMap((workout) => workout.items.map((x) => x.name)))];
  const catalog: Exercise[] = names.map((name) => ({
    ...strength, id: name, name,
    category: ['Walking', 'Stationary Bike', 'Yoga'].includes(name) ? 'cardio' : 'strength',
  }));
  it('contains six unique ideas and resolves only seeded built-ins', () => {
    assert.equal(STARTER_WORKOUTS.length, 6);
    assert.equal(new Set(STARTER_WORKOUTS.map((x) => x.id)).size, 6);
    for (const name of names) assert.ok(migration.includes(`'${name}'`), `${name} must be seeded`);
    const custom = { ...catalog[0], id: 'custom', user_id: 'user' };
    for (const workout of STARTER_WORKOUTS) {
      const result = starterWorkoutExercises(workout, [custom, ...catalog]);
      assert.ok(result.every((x) => x.exercise.user_id === null && x.weightKg === null));
      validateRoutine(workout.name, result.map((x, i) => routineExerciseForm(x, 'metric', String(i))), 'metric');
    }
  });
  it('reports a missing built-in instead of substituting and makes independent targets', () => {
    const workout = STARTER_WORKOUTS[0];
    assert.throws(() => starterWorkoutExercises(workout, []), /missing/);
    assert.throws(() => starterWorkoutExercises(workout, catalog.map((x) => ({ ...x, user_id: 'user' }))), /missing/);
    const first = starterWorkoutExercises(workout, catalog);
    first[0].sets = 50;
    assert.equal(starterWorkoutExercises(workout, catalog)[0].sets, workout.items[0].sets);
  });
});
