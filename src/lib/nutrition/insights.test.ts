import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NutritionTargets } from '../../types';
import { addDays, toDateString } from '../diary';
import { applyAdaptiveCalorieAdjustment } from './targets';
import { adaptiveTargetSuggestion, weeklyNutritionInsight } from './insights';

const targets: NutritionTargets = {
  user_id: 'u', calories: 2000, protein_g: 130, carbs_g: 220, fat_g: 60, bmr: 1500, tdee: 2500, floor_applied: false,
};
const today = '2026-10-29';
const weights = (values: number[]) => values.map((value, index) => ({ date: addDays(today, [-20, -14, -7, 0][index]), value }));
const loggedDays = (count: number) => Array.from({ length: count }, (_, index) => ({ logged_on: addDays(today, -index) }));

test('weekly insights average logged days only and keep the count visible', () => {
  const result = weeklyNutritionInsight([
    { logged_on: today, calories: 1800, protein_g: 100, carbs_g: 200, fat_g: 50 },
    { logged_on: today, calories: 200, protein_g: 20, carbs_g: 20, fat_g: 10 },
    { logged_on: addDays(today, -2), calories: 1600, protein_g: 80, carbs_g: 170, fat_g: 45 },
  ], targets, today);
  assert.equal(result.loggedDays, 2);
  assert.equal(result.average?.calories, 1800);
  assert.equal(result.average?.protein, 100);
  assert.equal(result.days, 7);
});

test('adaptive targets require substantial food and weight history', () => {
  assert.deepEqual(adaptiveTargetSuggestion({
    entries: loggedDays(13), weights: weights([70, 70, 70, 70]), today, goal: 'lose', sex: 'female', targets,
  }), { status: 'insufficient', reason: 'Log food on at least 14 of the last 21 days before considering a target change (13/14 so far).' });
  const stale = weights([70, 70, 70, 70]);
  stale[3].date = addDays(today, -4);
  assert.equal(adaptiveTargetSuggestion({
    entries: loggedDays(14), weights: stale, today, goal: 'lose', sex: 'female', targets,
  }).status, 'insufficient');
});

test('adaptive suggestions are small, goal-aware, and require explicit acceptance', () => {
  const result = adaptiveTargetSuggestion({
    entries: loggedDays(14), weights: weights([70, 70, 70, 70]), today, goal: 'lose', sex: 'female', targets,
  });
  assert.equal(result.status, 'suggestion');
  if (result.status !== 'suggestion') return;
  assert.equal(result.changeKcal, -100);
  assert.equal(result.targetCalories, 1900);
  assert.equal(result.targetCarbsG, 210);
  assert.equal(result.nextAdjustmentKcal, -100);
});

test('adaptive adjustments honor the floor and preserve protein and fat', () => {
  const adjusted = applyAdaptiveCalorieAdjustment({
    ...targets, calories: 1250, adaptive_calorie_adjustment: -100,
  }, -100, 'female');
  assert.equal(adjusted.calories, 1200);
  assert.equal(adjusted.protein_g, 130);
  assert.equal(adjusted.fat_g, 60);
  assert.equal(adjusted.carbs_g, 35);
  assert.equal(adjusted.floor_applied, true);
  assert.equal(adjusted.adaptive_calorie_adjustment, -50);
});

test('week calculations default to a local calendar date', () => {
  assert.match(toDateString(new Date()), /^\d{4}-\d{2}-\d{2}$/);
});
