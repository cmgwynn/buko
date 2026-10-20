import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activityAdjustedTargets, estimateCalories, estimateOneRepMax, movingAverage7, newRecordsFor, personalRecords, setsByMuscle, weeklyVolume,
} from '../calc';

const s = (date: string, reps: number, weight_kg: number, is_warmup = false) => ({ date, reps, weight_kg, is_warmup });

describe('personal records', () => {
  const hist = [s('2025-01-01', 10, 60), s('2025-01-08', 5, 80), s('2025-01-15', 8, 70), s('2025-01-15', 12, 40, true)];
  it('finds heaviest, best 1RM and best set volume, ignoring warm-ups', () => {
    const pr = personalRecords(hist);
    assert.deepEqual(pr.heaviest, { weight_kg: 80, reps: 5, date: '2025-01-08' });
    assert.equal(Math.round(pr.bestOneRepMax!.value), 93); // 80 x (1 + 5/30)
    assert.equal(pr.bestSetVolume!.value, 600); // 10 x 60 beats 8 x 70 = 560 and 5 x 80 = 400
  });
  it('epley', () => {
    assert.equal(estimateOneRepMax(100, 1), 100);
    assert.equal(Math.round(estimateOneRepMax(100, 10)), 133);
  });
  it('flags new records but not the first ever set', () => {
    assert.deepEqual(newRecordsFor([], { position: 0, reps: 5, weight_kg: 50, is_warmup: false, duration_s: null, distance_m: null }), []);
    const r = newRecordsFor(hist, { position: 0, reps: 5, weight_kg: 85, is_warmup: false, duration_s: null, distance_m: null });
    assert.ok(r.includes('heaviest') && r.includes('oneRepMax'));
    assert.deepEqual(newRecordsFor(hist, { position: 0, reps: 3, weight_kg: 50, is_warmup: false, duration_s: null, distance_m: null }), []);
  });
});

describe('weekly volume', () => {
  it('sums reps x weight per Monday-start week and fills empty weeks', () => {
    const v = weeklyVolume([s('2025-01-06', 10, 50), s('2025-01-08', 5, 100), s('2025-01-08', 10, 20, true)], 3, '2025-01-15');
    assert.deepEqual(v.map((w) => w.weekStart), ['2024-12-30', '2025-01-06', '2025-01-13']);
    assert.deepEqual(v.map((w) => w.volumeKg), [0, 1000, 0]);
    assert.equal(v[1].sets, 2);
  });
});

describe('sets by muscle', () => {
  it('counts working sets for the primary muscle only', () => {
    const out = setsByMuscle([
      { exercise: { category: 'strength', muscle_groups: ['chest', 'triceps'] }, sets: [{ reps: 8, is_warmup: false }, { reps: 8, is_warmup: false }, { reps: 10, is_warmup: true }] },
      { exercise: { category: 'cardio', muscle_groups: ['cardio'] }, sets: [{ reps: null, is_warmup: false }] },
    ]);
    assert.deepEqual(out, { chest: 2 });
  });
});

describe('7-day moving average', () => {
  it('averages the trailing calendar week', () => {
    const pts = [
      { date: '2025-01-01', value: 80 }, { date: '2025-01-02', value: 82 }, { date: '2025-01-03', value: 81 },
      { date: '2025-01-09', value: 79 },
    ];
    const ma = movingAverage7(pts);
    assert.equal(ma[0].value, 80);
    assert.equal(ma[1].value, 81);
    assert.equal(ma[2].value, 81);
    assert.equal(ma[3].value, 80); // window is Jan 3 to Jan 9: (81 + 79) / 2
  });
});

describe('calories', () => {
  it('estimates from MET, weight and time', () => {
    assert.equal(estimateCalories(9.8, 70, 30), 343);
  });
  const input = { goal: 'maintain' as const, sex: 'male' as const, age: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate' as const };
  it('adjusted target starts from the sedentary baseline and adds half of burned calories', () => {
    const a = activityAdjustedTargets(input, 600, 0.5);
    assert.equal(a.bonusKcal, 300);
    assert.equal(a.calories, a.baseCalories + 300);
    const none = activityAdjustedTargets(input, 0, 0.5);
    assert.equal(none.calories, none.baseCalories);
    assert.ok(none.baseCalories < 2800); // lower than a moderately-active target, which avoids double counting
  });
  it('keeps the calorie floor', () => {
    const small = activityAdjustedTargets({ ...input, sex: 'male', goal: 'lose', weightKg: 45, heightCm: 150, age: 70 }, 0, 0.5);
    assert.ok(small.calories >= 1500 && small.floorApplied);
  });
  it('clamps the share', () => {
    assert.equal(activityAdjustedTargets(input, 400, 5).bonusKcal, 400);
    assert.equal(activityAdjustedTargets(input, 400, -1).bonusKcal, 0);
  });
});
