import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addLocalDays,
  addLocalMonths,
  assertDateString,
  formatLocalDate,
  isDateString,
  isValidDateString,
  localDateStartIso,
  monthRange,
  mondayOfWeek,
  parseLocalDate,
  weekDates,
} from './dates';

test('date strings are strict and reject impossible calendar dates', () => {
  for (const value of ['2026-02-29', '2026-13-01', '2026-2-01', '2026-04-31', '0000-01-01']) {
    assert.equal(isValidDateString(value), false, value);
    assert.throws(() => assertDateString(value), RangeError);
  }
  assert.equal(assertDateString('2024-02-29'), '2024-02-29');
  assert.equal(isDateString('2024-02-29'), true);
  assert.equal(isDateString('1899-12-31'), false);
  assert.equal(isDateString('2101-01-01'), false);
  assert.equal(isDateString(null), false);
});

test('local date parsing and formatting round-trip without UTC date shifts', () => {
  const date = parseLocalDate('2026-10-24');
  assert.equal(formatLocalDate(date), '2026-10-24');
  assert.equal(localDateStartIso('2026-10-24'), date.toISOString());
});

test('day arithmetic follows calendar days across month and year boundaries', () => {
  assert.equal(addLocalDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addLocalDays('2024-03-01', -1), '2024-02-29');
});

test('week dates start Monday and preserve all seven local dates', () => {
  assert.equal(mondayOfWeek('2026-10-25'), '2026-10-19');
  assert.deepEqual(weekDates('2026-10-25'), [
    '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
  ]);
  assert.equal(mondayOfWeek('2026-10-19'), '2026-10-19');
});

test('month ranges and month movement clip leap-day values safely', () => {
  assert.deepEqual(monthRange('2024-02-29'), { start: '2024-02-01', end: '2024-02-29' });
  assert.equal(addLocalMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addLocalMonths('2024-03-31', -1), '2024-02-29');
});

test('local workout bounds span DST days without fixed 24-hour assumptions', () => {
  const priorTimezone = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const springStart = Date.parse(localDateStartIso('2026-03-08'));
    const springEnd = Date.parse(localDateStartIso(addLocalDays('2026-03-08', 1)));
    assert.equal((springEnd - springStart) / 3_600_000, 23);
    const fallStart = Date.parse(localDateStartIso('2026-11-01'));
    const fallEnd = Date.parse(localDateStartIso(addLocalDays('2026-11-01', 1)));
    assert.equal((fallEnd - fallStart) / 3_600_000, 25);
  } finally {
    if (priorTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = priorTimezone;
  }
});
