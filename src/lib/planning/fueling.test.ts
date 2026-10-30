import assert from 'node:assert/strict';
import test from 'node:test';
import { fuelLabel, fuelWeek, sessionKcal, type PlannedSession } from './fueling';

const base = { calories: 2200, protein_g: 150, carbs_g: 240, fat_g: 70 };
const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
const run = (date: string, minutes: number): PlannedSession => ({
  planned_for: date, snapshot: [{ exercise: { name: 'Running', category: 'cardio', met: 9.8 }, sets: [{ is_warmup: false, duration_s: minutes * 60 }] }],
});
const lift = (date: string, sets: number): PlannedSession => ({
  planned_for: date, snapshot: [{ exercise: { name: 'Squat', category: 'strength', met: 5 }, sets: Array.from({ length: sets }, () => ({ is_warmup: false, duration_s: null })) }],
});

test('estimates run and strength energy from MET, weight and time; warmups ignored', () => {
  assert.equal(sessionKcal(run('x', 30), 70), Math.round(9.8 * 70 * 0.5));
  assert.equal(sessionKcal(lift('x', 12), 80), Math.round(5 * 80 * 0.5));
  const warm: PlannedSession = { planned_for: 'x', snapshot: [{ ...lift('x', 3).snapshot[0], sets: [{ is_warmup: true, duration_s: null }, ...lift('x', 3).snapshot[0].sets] }] };
  assert.equal(sessionKcal(warm, 80), sessionKcal(lift('x', 3), 80));
});

test('training days gain, rest days give back the same total, and only carbs move', () => {
  const days = fuelWeek(week, [run(week[0], 30), lift(week[2], 12), run(week[4], 45)], base, 70);
  assert.equal(days.reduce((sum, day) => sum + day.targets.calories, 0), base.calories * 7);
  assert.ok(days[0].shiftKcal > 0 && days[2].shiftKcal > 0);
  assert.ok(days.filter((day) => day.kind === 'rest').every((day) => day.shiftKcal < 0 && day.shiftKcal >= -148));
  assert.equal(days.reduce((sum, day) => sum + day.targets.carbs_g, 0), 240 * 7);
  for (const day of days) {
    assert.equal(day.targets.protein_g, 150);
    assert.equal(day.targets.fat_g, 70);
    assert.equal(day.targets.carbs_g, 240 + day.shiftKcal / 4);
  }
  assert.equal(days[0].kind, 'run');
  assert.equal(days[2].kind, 'strength');
});

test('boosts are capped by the rest-day budget and are zero with no rest days or no training', () => {
  const heavy = fuelWeek(week, week.slice(0, 6).map((date) => run(date, 90)), base, 90);
  assert.equal(heavy[6].shiftKcal, -148);
  assert.equal(heavy.reduce((sum, day) => sum + day.shiftKcal, 0), 0);
  assert.ok(fuelWeek(week, week.map((date) => run(date, 30)), base, 70).every((day) => day.shiftKcal === 0));
  assert.ok(fuelWeek(week, [], base, 70).every((day) => day.shiftKcal === 0 && day.kind === 'rest'));
});

test('labels', () => {
  assert.equal(fuelLabel({ kind: 'run', shiftKcal: 172 }), 'Run day · +172 kcal');
  assert.equal(fuelLabel({ kind: 'rest', shiftKcal: -60 }), 'Rest day · −60 kcal');
  assert.equal(fuelLabel({ kind: 'mixed', shiftKcal: 0 }), 'Run + strength');
});

test('untimed workouts are never cut, and low-carb bases never go negative or drift', () => {
  const empty: PlannedSession = { planned_for: week[1], snapshot: [{ exercise: { name: 'Squat', category: 'strength', met: 5 }, sets: [{ is_warmup: true, duration_s: null }] }] };
  const days = fuelWeek(week, [run(week[0], 60), empty], base, 70);
  assert.equal(days[1].kind, 'strength');
  assert.equal(days[1].shiftKcal, 0);
  const low = fuelWeek(week, [run(week[0], 90)], { ...base, carbs_g: 10 }, 90);
  assert.ok(low.every((day) => day.targets.carbs_g >= 0));
  assert.equal(low.reduce((sum, day) => sum + day.targets.carbs_g, 0), 70);
  assert.equal(low.reduce((sum, day) => sum + day.targets.calories, 0), base.calories * 7);
});
