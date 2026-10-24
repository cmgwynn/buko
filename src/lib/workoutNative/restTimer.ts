import type { WorkoutActivityProps, WorkoutNativeState } from './types';

/** While the app is in the foreground, the scheduled notification is cancelled this long before rest ends so only the in-app cue fires. */
export const FOREGROUND_HANDOFF_MS = 1500;
/** A cue that would play later than this after rest ended is skipped (e.g. the JS thread was suspended). */
export const LATE_CUE_TOLERANCE_MS = 4000;
export const REST_ADJUST_STEP_S = 15;

export function restRemainingMs(restEndsAt: number | null, now: number): number {
  return restEndsAt == null ? 0 : Math.max(0, restEndsAt - now);
}

/** Apply a +15 s / -15 s style change. Returns null when the adjusted rest would already be over. */
export function adjustRestEnd(restEndsAt: number | null, deltaSeconds: number, now: number): number | null {
  if (restEndsAt == null) return null;
  const next = Math.max(restEndsAt, now) + deltaSeconds * 1000;
  return next <= now ? null : next;
}

export interface RestAlertInput {
  restEndsAt: number | null;
  now: number;
  appActive: boolean;
  alertsGranted: boolean;
  /** This restEndsAt was already finished, dismissed or paused; it never alerts again. */
  suppressed: boolean;
}

/** When the local notification should fire, or null when none should be scheduled. */
export function desiredNotificationAt(input: RestAlertInput): number | null {
  const { restEndsAt, now, appActive, alertsGranted, suppressed } = input;
  if (restEndsAt == null || suppressed || !alertsGranted) return null;
  const remaining = restEndsAt - now;
  if (remaining < 1000) return null;
  if (appActive && remaining <= FOREGROUND_HANDOFF_MS) return null;
  return restEndsAt;
}

/**
 * Whether the in-app haptic + sound cue should play now. Only when the app was already in the foreground
 * before rest ended; otherwise the notification has announced it and a second cue would double-alert.
 */
export function shouldPlayCue(input: Omit<RestAlertInput, 'alertsGranted'> & { activeSince: number | null }): boolean {
  const { restEndsAt, now, appActive, suppressed, activeSince } = input;
  if (restEndsAt == null || suppressed || !appActive || activeSince == null || activeSince >= restEndsAt) return false;
  return now >= restEndsAt && now - restEndsAt <= LATE_CUE_TOLERANCE_MS;
}

/**
 * On returning to the foreground: a rest that ended while the app was away was already announced by the
 * notification (or could not be), so it is marked handled instead of replaying a late cue.
 */
export function endedWhileAway(restEndsAt: number | null, now: number): boolean {
  return restEndsAt != null && now - restEndsAt > LATE_CUE_TOLERANCE_MS;
}

/** Future moments at which the hook must re-evaluate (notification handoff and rest end). */
export function nextWakeups(restEndsAt: number | null, now: number): number[] {
  if (restEndsAt == null) return [];
  return [restEndsAt - FOREGROUND_HANDOFF_MS, restEndsAt].filter((t) => t > now);
}

export function setsLabel(completed: number, total: number): string {
  const safeTotal = Math.max(0, Math.round(total || 0));
  const done = Math.max(0, Math.round(completed || 0));
  return safeTotal > 0 ? Math.min(done, safeTotal) + '/' + safeTotal + ' sets' : done + (done === 1 ? ' set' : ' sets');
}

export function activityProps(state: WorkoutNativeState, now: number, paused: boolean, restStartedAt: number | null): WorkoutActivityProps {
  const resting = !paused && state.restEndsAt != null && state.restEndsAt > now;
  return {
    workoutName: (state.name.trim() || 'Workout').slice(0, 60),
    exerciseName: (state.exerciseName?.trim() || 'Workout in progress').slice(0, 60),
    setsLabel: setsLabel(state.completedSets, state.totalSets),
    restStartMs: resting ? Math.min(restStartedAt ?? now, now) : null,
    restEndMs: resting ? state.restEndsAt : null,
    paused,
  };
}

export const REST_NOTIFICATION_PREFIX = 'buko-rest-';
export const restNotificationId = (sessionId: string) => REST_NOTIFICATION_PREFIX + sessionId;
export const restKey = (sessionId: string, restEndsAt: number | null) => sessionId + ':' + (restEndsAt ?? 'none');

export interface ActivityRecord {
  activityId: string;
  sessionId: string;
}

/**
 * Decide which running Live Activities to keep after a relaunch. Only the activity recorded for the current
 * session is adopted; everything else (older sessions, another signed-in account, unknown) is ended.
 */
export function planActivityReconcile(instanceIds: string[], record: ActivityRecord | null, sessionId: string | null) {
  const adopt = sessionId && record && record.sessionId === sessionId && instanceIds.includes(record.activityId) ? record.activityId : null;
  return { adopt, end: instanceIds.filter((id) => id !== adopt) };
}
