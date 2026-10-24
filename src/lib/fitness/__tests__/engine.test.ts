import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  completeSet, undoSet, advanceSession, assignSuperset, clearSuperset, startRestTimer,
  adjustRestTimer, pauseWorkout, resumeWorkout, workoutDurationMs, setRpe,
  swapExercise,
} from '../engine';
import { applyHistoryPrefill } from '../prefill';
import { summarizeSession } from '../summary';
import type { WorkoutSession } from '../session';
import type { WorkoutSet } from '../types';

const set = (id: string, patch: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id, position: 0, reps: 5, weight_kg: 20, is_warmup: false, duration_s: null, distance_m: null,
  completed_at: null, completed: false, ...patch,
});
function session(): WorkoutSession {
  return {
    active: true, sessionId: 'session', name: 'Workout', startedAt: 1000, routineId: null,
    focusIndex: 0, restEndsAt: null, totalPausedMs: 0,
    items: ['a', 'b'].map((id) => {
      const sets = [set(`${id}1`), set(`${id}2`, { position: 1 })];
      return {
        id, key: id, restSeconds: 60, sets, initialSets: structuredClone(sets),
        exercise: { id, name: id, category: 'strength', user_id: null, muscle_groups: ['quads'], equipment: null, met: 5 },
      };
    }),
  };
}

describe('pure focused workout actions', () => {
  it('completes, starts rest and undoes without mutating the original or changing identities', () => {
    const original = session();
    const done = completeSet(original, 'a', 'a1', 2000);
    assert.equal(original.items[0].sets[0].completed_at, null);
    assert.equal(done.items[0].sets[0].completed_at, new Date(2000).toISOString());
    assert.equal(done.items[0].sets[0].id, 'a1');
    assert.equal(done.restEndsAt, 62_000);
    assert.equal(completeSet(done, 'a', 'a1', 3000), done);
    assert.equal(undoSet(done, 'a', 'a1').items[0].sets[0].completed_at, null);
  });
  it('rejects invalid completion and RPE, while allowing zero-weight/bodyweight reps and distance-only cardio', () => {
    const original = session();
    for (const patch of [{ reps: null }, { reps: -1 }, { reps: 2.5 }, { weight_kg: Infinity }, { rpe: 11 }]) {
      const invalid = structuredClone(original);
      invalid.items[0].sets[0] = { ...invalid.items[0].sets[0], ...patch };
      assert.throws(() => completeSet(invalid, 'a', 0));
    }
    const bodyweight = structuredClone(original);
    bodyweight.items[0].sets[0].weight_kg = 0;
    assert.ok(completeSet(bodyweight, 'a', 0).items[0].sets[0].completed_at);
    bodyweight.items[0].exercise.category = 'cardio';
    bodyweight.items[0].sets[0] = set('a1', { reps: null, distance_m: 200 });
    assert.ok(completeSet(bodyweight, 'a', 0).items[0].sets[0].completed_at);
    assert.equal(setRpe(original, 'a', 0, 11), original);
    assert.equal(setRpe(original, 'a', 0, 10).items[0].sets[0].rpe, 10);
  });
  it('rotates superset partners without resting between them, then rests between rounds', () => {
    const grouped = assignSuperset(session(), ['a', 'b'], 'group');
    const first = completeSet(grouped, 'a', 0, 2000);
    assert.equal(first.focusIndex, 1);
    assert.equal(first.restEndsAt, null);
    const second = completeSet(first, 'b', 0, 3000);
    assert.equal(second.focusIndex, 0);
    assert.equal(second.restEndsAt, 63_000);
    assert.ok(clearSuperset(grouped, 'group').items.every((item) => item.supersetId === null));
    assert.equal(advanceSession(session()).focusIndex, 1);
  });
  it('uses absolute rest deadlines and excludes repeated pauses from active duration', () => {
    const resting = startRestTimer(session(), 60, 2000);
    const paused = pauseWorkout(resting, 10_000);
    assert.equal(pauseWorkout(paused, 20_000), paused);
    assert.equal(workoutDurationMs(paused, 30_000), 9000);
    assert.throws(() => completeSet(paused, 'a', 0), /Resume/);
    const adjusted = adjustRestTimer(paused, -15, 99_000);
    assert.equal(adjusted.restEndsAt, 47_000);
    const resumed = resumeWorkout(adjusted, 40_000);
    assert.equal(resumed.totalPausedMs, 30_000);
    assert.equal(resumed.restEndsAt, 77_000);
    assert.equal(workoutDurationMs(resumed, 50_000), 19_000);
    assert.equal(adjustRestTimer(resumed, -100, 50_000).restEndsAt, null);
  });
  it('swaps only remaining sets, preserving the original exercise for completed history and stable set IDs', () => {
    const original = completeSet(session(), 'a', 0, 2000);
    const exercise = { ...original.items[0].exercise, id: 'replacement', name: 'Replacement' };
    const swapped = swapExercise(original, 'a', exercise, () => 'replacement-item');
    assert.equal(swapped.items[0].exercise.id, 'a');
    assert.deepEqual(swapped.items[0].sets.map((set) => set.id), ['a1']);
    assert.equal(swapped.items[1].exercise.id, 'replacement');
    assert.deepEqual(swapped.items[1].sets.map((set) => set.id), ['a2']);
    assert.equal(swapped.items[1].id, 'replacement-item');
    assert.equal(swapped.focusIndex, 1);
    assert.throws(() => swapExercise(original, 'a', { ...exercise, category: 'cardio' }, () => 'x'), /same category/);
  });
});

describe('cached prefill and workout summaries', () => {
  it('prefills corresponding last-session sets, preserving edits, completed fields and routine fallbacks', () => {
    const captured = session();
    const current = structuredClone(captured);
    current.items[0].sets[0].reps = 12;
    current.items[0].sets[1].duration_s = 45;
    current.items[0].sets[1].prefillEditedFields = ['weight_kg'];
    const result = applyHistoryPrefill(current, captured, {
      a: { sessions: [{ workoutId: 'prior', date: '2026-10-23', sets: [set('old1', { reps: 8, weight_kg: 30 }), set('old2', { reps: 9, weight_kg: 35, duration_s: 60 })] }] },
    });
    assert.equal(result.items[0].sets[0].reps, 12);
    assert.equal(result.items[0].sets[0].weight_kg, 30);
    assert.equal(result.items[0].sets[1].reps, 9);
    assert.equal(result.items[0].sets[1].duration_s, 45);
    assert.equal(result.items[0].sets[1].weight_kg, 20);
    assert.equal(result.items[1].sets[0].weight_kg, 20);
    assert.equal(applyHistoryPrefill(result, captured, {}), result);
    assert.equal(current.items[0].sets[0].weight_kg, 20);
  });
  it('does not apply a late history read to a swapped exercise or another session', () => {
    const captured = session();
    const other = { ...captured, sessionId: 'another' };
    assert.equal(applyHistoryPrefill(other, captured, {}), other);
    const swapped = structuredClone(captured);
    swapped.items[0].exercise.id = 'new';
    const result = applyHistoryPrefill(swapped, captured, {
      a: { sessions: [{ workoutId: 'prior', date: '2026-10-23', sets: [set('prior', { weight_kg: 999 })] }] },
    });
    assert.equal(result.items[0].sets[0].weight_kg, 20);
  });
  it('counts completed sets only, excludes warmups from volume and PRs, and keeps baseline/ties out', () => {
    const workout = session();
    workout.items[0].sets = [
      set('warmup', { completed: true, weight_kg: 100, is_warmup: true }),
      set('tie', { completed: true }),
      set('record', { completed: true, weight_kg: 25 }),
      set('pending', { weight_kg: 500 }),
    ];
    const history = { a: [{ date: '2026-10-23', reps: 5, weight_kg: 20, is_warmup: false }] };
    const summary = summarizeSession(workout, history, 61_000);
    assert.equal(summary.durationSec, 60);
    assert.equal(summary.completedSets, 3);
    assert.equal(summary.volumeKg, 225);
    assert.equal(summary.records.length, 3);
    assert.equal(summary.records[0].exerciseName, 'a');
    assert.equal(summary.records[0].previousValue, 20);
    assert.equal(summarizeSession(workout, {}, 61_000).records.length, 0);
    workout.items[0].sets = [set('tie', { completed_at: '2026-10-24T00:00:00Z' })];
    assert.equal(summarizeSession(workout, history).records.length, 0);
  });
});
