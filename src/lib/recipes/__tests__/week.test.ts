import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionFor } from '../sections';
import { dayStatus, weekDays, weekStart } from '../week';

test('weekStart returns the Monday', () => {
  assert.equal(weekStart('2025-01-01'), '2024-12-30'); // Wednesday
  assert.equal(weekStart('2025-01-05'), '2024-12-30'); // Sunday
  assert.equal(weekStart('2024-12-30'), '2024-12-30'); // Monday
});

test('weekDays gives seven consecutive days', () => {
  const d = weekDays('2024-12-30');
  assert.equal(d.length, 7);
  assert.equal(d[6], '2025-01-05');
});

test('dayStatus thresholds', () => {
  assert.equal(dayStatus(0, 2000), 'empty');
  assert.equal(dayStatus(1500, 2000), 'under');
  assert.equal(dayStatus(2000, 2000), 'on');
  assert.equal(dayStatus(2400, 2000), 'over');
});

test('peanut butter is a pantry item', () => {
  assert.equal(sectionFor('peanut butter'), 'pantry');
});
