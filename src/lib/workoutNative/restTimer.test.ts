import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FOREGROUND_HANDOFF_MS,
  activityProps,
  adjustRestEnd,
  desiredNotificationAt,
  endedWhileAway,
  nextWakeups,
  planActivityReconcile,
  restKey,
  restNotificationId,
  restRemainingMs,
  setsLabel,
  shouldPlayCue,
} from './restTimer';

const NOW = 1_700_000_000_000;
const base = { now: NOW, appActive: false, alertsGranted: true, suppressed: false };

describe('rest timer math', () => {
  it('computes remaining time without going negative', () => {
    assert.equal(restRemainingMs(NOW + 5000, NOW), 5000);
    assert.equal(restRemainingMs(NOW - 5000, NOW), 0);
    assert.equal(restRemainingMs(null, NOW), 0);
  });

  it('adjusts by +15/-15 seconds and ends rest when nothing is left', () => {
    assert.equal(adjustRestEnd(NOW + 30_000, 15, NOW), NOW + 45_000);
    assert.equal(adjustRestEnd(NOW + 30_000, -15, NOW), NOW + 15_000);
    assert.equal(adjustRestEnd(NOW + 10_000, -15, NOW), null);
    assert.equal(adjustRestEnd(NOW - 2_000, 15, NOW), NOW + 15_000, 'extending an expired rest starts from now');
    assert.equal(adjustRestEnd(null, 15, NOW), null);
  });

  it('labels sets', () => {
    assert.equal(setsLabel(2, 5), '2/5 sets');
    assert.equal(setsLabel(7, 5), '5/5 sets');
    assert.equal(setsLabel(1, 0), '1 set');
    assert.equal(setsLabel(Number.NaN, Number.NaN), '0 sets');
  });
});

describe('notification scheduling', () => {
  it('schedules exactly at rest end while backgrounded', () => {
    assert.equal(desiredNotificationAt({ ...base, restEndsAt: NOW + 60_000 }), NOW + 60_000);
  });

  it('keeps the notification while foregrounded until the handoff window', () => {
    assert.equal(desiredNotificationAt({ ...base, appActive: true, restEndsAt: NOW + 60_000 }), NOW + 60_000);
    assert.equal(desiredNotificationAt({ ...base, appActive: true, restEndsAt: NOW + FOREGROUND_HANDOFF_MS }), null);
  });

  it('never schedules without permission, when suppressed, when over or almost over', () => {
    assert.equal(desiredNotificationAt({ ...base, alertsGranted: false, restEndsAt: NOW + 60_000 }), null);
    assert.equal(desiredNotificationAt({ ...base, suppressed: true, restEndsAt: NOW + 60_000 }), null);
    assert.equal(desiredNotificationAt({ ...base, restEndsAt: NOW + 500 }), null);
    assert.equal(desiredNotificationAt({ ...base, restEndsAt: null }), null);
  });

  it('uses one stable identifier per session so rescheduling replaces', () => {
    assert.equal(restNotificationId('abc'), restNotificationId('abc'));
    assert.notEqual(restKey('abc', NOW), restKey('abc', NOW + 15_000));
  });

  it('wakes for the handoff and the end', () => {
    assert.deepEqual(nextWakeups(NOW + 10_000, NOW), [NOW + 10_000 - FOREGROUND_HANDOFF_MS, NOW + 10_000]);
    assert.deepEqual(nextWakeups(NOW + 1_000, NOW), [NOW + 1_000]);
    assert.deepEqual(nextWakeups(NOW - 1, NOW), []);
  });
});

describe('foreground cue de-duplication', () => {
  const cue = { restEndsAt: NOW, now: NOW + 100, appActive: true, suppressed: false, activeSince: NOW - 30_000 };
  it('plays when the app stayed in the foreground through rest end', () => {
    assert.equal(shouldPlayCue(cue), true);
  });
  it('does not play after returning from background (notification already alerted)', () => {
    assert.equal(shouldPlayCue({ ...cue, activeSince: NOW + 50 }), false);
    assert.equal(shouldPlayCue({ ...cue, appActive: false }), false);
  });
  it('does not replay once handled or when far too late', () => {
    assert.equal(shouldPlayCue({ ...cue, suppressed: true }), false);
    assert.equal(shouldPlayCue({ ...cue, now: NOW + 10_000 }), false);
    assert.equal(shouldPlayCue({ ...cue, now: NOW - 1 }), false);
  });
  it('marks rests that ended while away as handled', () => {
    assert.equal(endedWhileAway(NOW, NOW + 60_000), true);
    assert.equal(endedWhileAway(NOW, NOW + 1_000), false);
    assert.equal(endedWhileAway(null, NOW), false);
  });
});

describe('Live Activity props and reconciliation', () => {
  const state = { sessionId: 's1', name: ' Push day ', exerciseName: 'Bench', completedSets: 3, totalSets: 9, restEndsAt: NOW + 60_000, active: true };

  it('includes a rest window only while resting and not paused', () => {
    assert.deepEqual(activityProps(state, NOW, false, NOW - 30_000), {
      workoutName: 'Push day',
      exerciseName: 'Bench',
      setsLabel: '3/9 sets',
      restStartMs: NOW - 30_000,
      restEndMs: NOW + 60_000,
      paused: false,
    });
    const paused = activityProps(state, NOW, true, NOW);
    assert.equal(paused.restEndMs, null);
    assert.equal(paused.paused, true);
    assert.equal(activityProps({ ...state, restEndsAt: NOW - 1 }, NOW, false, null).restEndMs, null);
    assert.equal(activityProps({ ...state, name: '', exerciseName: null }, NOW, false, null).workoutName, 'Workout');
  });

  it('adopts only the recorded activity for the current session and ends all others', () => {
    const record = { activityId: 'a1', sessionId: 's1' };
    assert.deepEqual(planActivityReconcile(['a1', 'a2'], record, 's1'), { adopt: 'a1', end: ['a2'] });
    assert.deepEqual(planActivityReconcile(['a1'], record, 's2'), { adopt: null, end: ['a1'] });
    assert.deepEqual(planActivityReconcile(['a1'], record, null), { adopt: null, end: ['a1'] });
    assert.deepEqual(planActivityReconcile(['a3'], null, 's1'), { adopt: null, end: ['a3'] });
  });
});
