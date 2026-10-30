import assert from 'node:assert/strict';
import test from 'node:test';
import { adjustSnapshot, checkinPromptDay, mealAdvice, reviewWeek, summarizeWeek, trainingAdvice, type WeekSummary } from './checkin';
import type { WorkoutSet } from '../fitness/types';

test('reviews the week ending Sunday, otherwise last week', () => {
  assert.deepEqual(reviewWeek('2026-11-08'), { start: '2026-11-02', end: '2026-11-08', next: '2026-11-09' }); // Sunday
  assert.deepEqual(reviewWeek('2026-11-09'), { start: '2026-11-02', end: '2026-11-08', next: '2026-11-09' }); // Monday
  assert.deepEqual(reviewWeek('2026-11-13'), { start: '2026-11-02', end: '2026-11-08', next: '2026-11-09' }); // Friday
  assert.equal(checkinPromptDay('2026-11-08'), true);
  assert.equal(checkinPromptDay('2026-11-10'), true);
  assert.equal(checkinPromptDay('2026-11-11'), false);
});

test('summarizes only the review week', () => {
  const summary = summarizeWeek({
    start: '2026-11-02', end: '2026-11-08',
    planned: [{ planned_for: '2026-11-02', completed_workout_id: 'w' }, { planned_for: '2026-11-04', completed_workout_id: null }, { planned_for: '2026-11-09', completed_workout_id: null }],
    foodLogDates: ['2026-11-02', '2026-11-02', '2026-11-03', '2026-11-01'],
    mealPlan: [{ planned_on: '2026-11-03', logged_at: 'x' }, { planned_on: '2026-11-05', logged_at: null }],
  });
  assert.deepEqual(summary, { workoutsPlanned: 2, workoutsDone: 1, foodDays: 2, mealsPlanned: 2, mealsEaten: 1 });
});

const week = (done: number, planned = 4): WeekSummary => ({ workoutsPlanned: planned, workoutsDone: done, foodDays: 6, mealsPlanned: 14, mealsEaten: 12 });
test('training advice follows adherence and feel', () => {
  assert.equal(trainingAdvice(week(0, 0), 'easy'), null);
  assert.equal(trainingAdvice(week(1), null)?.mode, 'ease');
  assert.equal(trainingAdvice(week(4), 'hard')?.mode, 'ease');
  assert.equal(trainingAdvice(week(4), 'easy')?.mode, 'progress');
  assert.equal(trainingAdvice(week(2), 'easy')?.mode, 'hold');
  assert.equal(trainingAdvice(week(4), null)?.mode, 'hold');
});

const set = (patch: Partial<WorkoutSet>, position = 0): WorkoutSet => ({ position, reps: null, weight_kg: null, is_warmup: false, duration_s: null, distance_m: null, completed: false, ...patch });
test('adjusts cardio time and strength volume without mutating input', () => {
  const run = { exercise: { category: 'cardio' }, sets: [set({ duration_s: 1200 })] };
  const squat = { exercise: { category: 'strength' }, sets: [set({ reps: 5, is_warmup: true }, 0), set({ reps: 8 }, 1), set({ reps: 8 }, 2), set({ reps: 8 }, 3)] };
  const eased = adjustSnapshot([run, squat], 'ease');
  assert.equal(eased[0].sets[0].duration_s, 1020);
  assert.equal(eased[1].sets.length, 3);
  assert.deepEqual(eased[1].sets.map((s) => s.position), [0, 1, 2]);
  const pushed = adjustSnapshot([run, squat], 'progress');
  assert.equal(pushed[0].sets[0].duration_s, 1320);
  assert.deepEqual(pushed[1].sets.map((s) => s.reps), [5, 9, 9, 9]);
  assert.equal(run.sets[0].duration_s, 1200);
  assert.equal(squat.sets.length, 4);
  const short = { exercise: { category: 'strength' }, sets: [set({ reps: 8 }), set({ reps: 8 }, 1)] };
  assert.equal(adjustSnapshot([short], 'ease')[0].sets.length, 2);
  assert.equal(adjustSnapshot([{ exercise: { category: 'cardio' }, sets: [set({ duration_s: 60 })] }], 'ease')[0].sets[0].duration_s, 60);
});

test('meal advice', () => {
  assert.match(mealAdvice({ ...week(4), mealsEaten: 3 }) ?? '', /just dinners/);
  assert.match(mealAdvice({ ...week(4), foodDays: 2 }) ?? '', /at least 4 days/);
  assert.equal(mealAdvice(week(4)), null);
});
