import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBmr, calculateTargets, floorWarning } from './targets';

test('Mifflin-St Jeor matches hand calculation', () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(calculateBmr('male', 30, 180, 80), 1780);
  // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
  assert.equal(calculateBmr('female', 30, 165, 60), 1320.25);
});

test('maintenance target = TDEE and macros add up', () => {
  const r = calculateTargets({ goal: 'maintain', sex: 'male', age: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate' });
  assert.equal(r.tdee, Math.round(1780 * 1.55));
  assert.equal(r.floorApplied, false);
  assert.ok(Math.abs(r.proteinG * 4 + r.carbsG * 4 + r.fatG * 9 - r.calories) < 12);
});

test('target below the floor is raised and flagged with a warning', () => {
  const f = calculateTargets({ goal: 'lose', sex: 'female', age: 60, heightCm: 150, weightKg: 45, activityLevel: 'sedentary' });
  assert.equal(f.floorApplied, true);
  assert.equal(f.calories, 1200);
  assert.ok(floorWarning(f));
  const m = calculateTargets({ goal: 'lose', sex: 'male', age: 70, heightCm: 160, weightKg: 55, activityLevel: 'sedentary' });
  assert.equal(m.calories, 1500);
  assert.ok(m.floorApplied);
});

test('no warning when above floor', () => {
  const r = calculateTargets({ goal: 'gain', sex: 'female', age: 25, heightCm: 170, weightKg: 65, activityLevel: 'active' });
  assert.equal(floorWarning(r), null);
});
