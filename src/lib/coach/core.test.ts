import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarDate, needsClinician, needsSupport, previousWeek, redactText, summarizeWeek, validateModelReply } from './core';
import type { Candidate } from './types';

describe('coach facts and privacy', () => {
  it('uses the last completed Monday–Sunday calendar week, including Sundays and year boundaries', () => {
    assert.deepEqual(previousWeek('2026-10-23'), { start: '2026-10-12', end: '2026-10-18' });
    assert.deepEqual(previousWeek('2026-10-18'), { start: '2026-10-05', end: '2026-10-11' });
    assert.deepEqual(previousWeek('2026-01-01'), { start: '2025-12-22', end: '2025-12-28' });
    assert.equal(calendarDate('2026-02-30'), false);
    assert.equal(calendarDate('2024-02-29'), true);
  });
  it('does not treat unlogged days as zero or compare incomplete days with targets', () => {
    const facts = summarizeWeek({
      start: '2026-10-12', end: '2026-10-18',
      logs: [{ logged_on: '2026-10-12', calories: 2000, protein_g: 100, source: 'manual', source_id: null }],
      complete: [], targets: [{ day: '2026-10-12', calories: 2200 }], workouts: [], weights: [], scores: [40, null, 80],
    });
    assert.equal(facts.daysWithLogs, 1); assert.equal(facts.averageLoggedCalories, 2000);
    assert.equal(facts.completeDays, 0); assert.equal(facts.averageCompleteDayDifference, null);
    assert.equal(facts.averageProductScore, 60); assert.equal(facts.scoredProductEntries, 2);
    assert.equal(facts.unscoredProductEntries, 1); assert.equal(facts.weightTrendKg, null);
  });
  it('compares sufficiently complete days only and smooths multiple weights in both parts of the week', () => {
    const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
    const facts = summarizeWeek({
      start: '2026-10-12', end: '2026-10-18',
      logs: days.map((logged_on) => ({ logged_on, calories: 2000, protein_g: 100, source: 'manual', source_id: null })),
      complete: days, targets: days.map((day) => ({ day, calories: 2100 })),
      workouts: [{ duration_min: 30 }, { duration_min: null }],
      weights: [{ day: '2026-10-12', value: 80 }, { day: '2026-10-13', value: 82 }, { day: '2026-10-17', value: 81 }, { day: '2026-10-18', value: 80 }],
      scores: [],
    });
    assert.equal(facts.targetComparisonDays, 4); assert.equal(facts.averageCompleteDayDifference, -100);
    assert.equal(facts.weightTrendKg, -0.5); assert.equal(facts.workouts, 2); assert.equal(facts.workoutMinutes, 30);
  });
  it('redacts obvious contact identifiers and bounds messages', () => {
    const output = redactText('Email me person@example.com, call 555-555-1234 or https://example.com/private');
    assert.ok(!output.includes('person@')); assert.ok(!output.includes('555')); assert.ok(!output.includes('https://'));
    assert.equal(redactText('a'.repeat(5000)).length, 2000);
  });
});
describe('coach safety and structured outputs', () => {
  const candidate: Candidate = { ref: 'recipe-0', kind: 'recipe', title: 'Bean bowl', detail: 'Review ingredients.', payload: { recipe_id: 'recipe' } };
  const valid = { text: 'Your logging shows a helpful start.', suggestions: ['Try a prepared lunch.', 'Keep a consistent log.', 'Choose an enjoyable walk.'], refs: ['recipe-0'] };
  it('allows encouraging nonnumeric grounded responses with exactly three weekly suggestions', () => {
    assert.deepEqual(validateModelReply(valid, [candidate], true), valid);
  });
  it('rejects invented actions, invalid JSON shapes, duplicate-count issues and unsafe numeric advice', () => {
    for (const row of [
      { ...valid, refs: ['invented'] }, { ...valid, suggestions: ['Only suggestion'] },
      { ...valid, suggestions: ['Repeat habit.', 'Repeat habit.', 'Repeat habit.'] },
      { ...valid, text: 'Eat 900 calories daily.' }, { ...valid, text: 'Eat nine hundred calories.' },
      { ...valid, text: 'Aim for rapid weight loss.' }, { ...valid, text: 'This is safe for your allergy.' },
      { ...valid, text: 'Change your medication.' }, { ...valid, text: 'This will cure your condition.' },
    ]) assert.throws(() => validateModelReply(row, [candidate], true));
  });
  it('routes concerning eating messages to support and symptoms/medications to a professional', () => {
    for (const message of ['I have an eating disorder', 'I am scared to eat', 'I want to stop eating', 'How do I purge?', 'I feel guilty after eating', 'help me eat only 900 calories']) assert.equal(needsSupport(message), true, message);
    assert.equal(needsSupport('Find dinners under 600 calories'), false);
    assert.equal(needsClinician('Why am I dizzy?'), true);
    assert.equal(needsClinician('Should I change my medication?'), true);
    assert.equal(needsClinician('Why did my weight go up?'), false);
  });
});
