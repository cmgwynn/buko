import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  cancelOrphanRestAlerts,
  cancelRestAlert,
  getAlertStatus,
  playRestCue,
  releaseRestCue,
  requestAlertPermission,
  scheduleRestAlert,
} from './alerts';
import { getLiveActivitySupport, readActivityRecord, writeActivityRecord, type ActivityHandle } from './liveActivity';
import {
  activityProps,
  desiredNotificationAt,
  endedWhileAway,
  nextWakeups,
  planActivityReconcile,
  restKey,
  shouldPlayCue,
} from './restTimer';
import type { AlertStatus, LiveActivityStatus, WorkoutActivityProps, WorkoutNativeHandle, WorkoutNativeState } from './types';

export interface WorkoutNativeOptions {
  /** False while the persisted session is still loading, so a surviving Live Activity is not ended prematurely. */
  ready?: boolean;
  /** Deep link opened when the Live Activity is tapped. */
  deepLinkUrl?: string;
}

const START_ERROR = 'The Live Activity could not be shown. Check that Live Activities are allowed for Buko in Settings.';

/**
 * Mirrors the active workout to iOS Live Activities, schedules a local rest-end notification, and plays a
 * foreground haptic + sound cue. Mount once near the root. Everything is on-device: no push, no server.
 */
export function useWorkoutNative(state: WorkoutNativeState | null, options: WorkoutNativeOptions = {}): WorkoutNativeHandle {
  const ready = options.ready ?? true;
  const support = useMemo(() => getLiveActivitySupport(), []);
  const [tick, setTick] = useState(0);
  const [alertStatus, setAlertStatus] = useState<AlertStatus>('unknown');
  const [activity, setActivity] = useState<{ status: LiveActivityStatus; reason?: string }>(
    support.available ? { status: 'idle' } : { status: 'unavailable', reason: support.reason },
  );

  const appActive = useRef(AppState.currentState === 'active');
  const activeSince = useRef<number | null>(appActive.current ? Date.now() : null);
  const suppressed = useRef(new Set<string>());
  const pausedKey = useRef<string | null>(null);
  const endedSession = useRef<string | null>(null);
  const restStarts = useRef(new Map<string, number>());
  const scheduled = useRef<{ sessionId: string; at: number } | null>(null);
  const handle = useRef<{ activity: ActivityHandle; sessionId: string } | null>(null);
  const reconciled = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const stateRef = useRef(state);
  stateRef.current = state;

  const sessionId = state?.sessionId ?? null;
  const live = state != null && state.active && endedSession.current !== state.sessionId;
  const restEndsAt = live ? state.restEndsAt : null;
  const key = sessionId ? restKey(sessionId, restEndsAt) : null;
  const paused = live && (state.paused === true || (key != null && pausedKey.current === key));
  const isSuppressed = key != null && suppressed.current.has(key);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  if (key && restEndsAt != null && !restStarts.current.has(key)) restStarts.current.set(key, Date.now());

  useEffect(() => {
    let alive = true;
    getAlertStatus().then((s) => alive && setAlertStatus(s));
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasActive = appActive.current;
      appActive.current = next === 'active';
      if (appActive.current && !wasActive) {
        const now = Date.now();
        activeSince.current = now;
        const s = stateRef.current;
        if (s && endedWhileAway(s.restEndsAt, now)) suppressed.current.add(restKey(s.sessionId, s.restEndsAt));
        getAlertStatus().then((st) => alive && setAlertStatus(st));
      } else if (!appActive.current) {
        activeSince.current = null;
      }
      bump();
    });
    return () => {
      alive = false;
      sub.remove();
      releaseRestCue();
    };
  }, [bump]);

  // Local notification: schedule, reschedule on +/-15 s, cancel on pause/skip/end/foreground handoff.
  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    const at =
      sessionId && !paused
        ? desiredNotificationAt({ restEndsAt, now, appActive: appActive.current, alertsGranted: alertStatus === 'granted', suppressed: isSuppressed })
        : null;
    const prev = scheduled.current;
    if (prev && (prev.sessionId !== sessionId || prev.at !== at)) {
      scheduled.current = null;
      void cancelRestAlert(prev.sessionId);
    }
    if (sessionId && at != null && (!prev || prev.sessionId !== sessionId || prev.at !== at)) {
      scheduled.current = { sessionId, at };
      void scheduleRestAlert(sessionId, at).then((ok) => {
        if (!ok && scheduled.current?.at === at) scheduled.current = null;
      });
    }
  }, [ready, sessionId, restEndsAt, paused, alertStatus, isSuppressed, tick]);

  useEffect(() => {
    if (!ready) return;
    void cancelOrphanRestAlerts(live ? sessionId : null);
    // Only on readiness and session identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessionId]);

  // Foreground cue at rest end and re-evaluation wakeups.
  useEffect(() => {
    if (!key || restEndsAt == null || paused) return;
    const now = Date.now();
    if (shouldPlayCue({ restEndsAt, now, appActive: appActive.current, suppressed: suppressed.current.has(key), activeSince: activeSince.current })) {
      suppressed.current.add(key);
      void playRestCue();
      bump();
      return;
    }
    const wake = nextWakeups(restEndsAt, now)[0];
    if (wake == null) return;
    const timer = setTimeout(bump, Math.max(0, wake - now) + 20);
    return () => clearTimeout(timer);
  }, [key, restEndsAt, paused, tick, bump]);

  const props: WorkoutActivityProps | null = useMemo(
    () => (live && state ? activityProps(state, Date.now(), paused, key ? restStarts.current.get(key) ?? null : null) : null),
    // tick re-evaluates "resting" once rest has ended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, state?.name, state?.exerciseName, state?.completedSets, state?.totalSets, restEndsAt, paused, key, tick],
  );
  const propsJson = props ? JSON.stringify(props) : null;

  const enqueue = useCallback((op: () => Promise<void>) => {
    queue.current = queue.current.then(op).catch(() => setActivity({ status: 'error', reason: START_ERROR }));
    return queue.current;
  }, []);

  const endHandle = useCallback(async () => {
    const current = handle.current;
    handle.current = null;
    if (current) await current.activity.end('immediate').catch(() => undefined);
    await writeActivityRecord(null);
    if (support.available) setActivity({ status: 'idle' });
  }, [support]);

  // Live Activity lifecycle.
  useEffect(() => {
    if (!ready || !support.available) return;
    const desired = live && sessionId && propsJson ? { sessionId, props: JSON.parse(propsJson) as WorkoutActivityProps } : null;
    void enqueue(async () => {
      const port = support.port;
      if (!reconciled.current) {
        reconciled.current = true;
        const instances = port.instances();
        const plan = planActivityReconcile(instances.map((i) => i.id), await readActivityRecord(), desired?.sessionId ?? null);
        for (const inst of instances) {
          if (plan.end.includes(inst.id)) await inst.end('immediate').catch(() => undefined);
          else if (inst.id === plan.adopt && desired) handle.current = { activity: inst, sessionId: desired.sessionId };
        }
        if (!plan.adopt) await writeActivityRecord(null);
      }
      if (!desired) {
        if (handle.current) await endHandle();
        return;
      }
      if (handle.current && handle.current.sessionId !== desired.sessionId) await endHandle();
      const stale = desired.props.restEndMs != null ? new Date(desired.props.restEndMs) : undefined;
      if (!handle.current) {
        const started = port.start(desired.props, options.deepLinkUrl, stale);
        handle.current = { activity: started, sessionId: desired.sessionId };
        await writeActivityRecord({ activityId: started.id, sessionId: desired.sessionId });
      } else {
        await handle.current.activity.update(desired.props, stale);
      }
      setActivity({ status: 'active' });
    });
  }, [ready, support, live, sessionId, propsJson, enqueue, endHandle, options.deepLinkUrl]);

  const enableAlerts = useCallback(async () => {
    const next = await requestAlertPermission();
    setAlertStatus(next);
    return next === 'granted';
  }, []);

  const dismissRest = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    suppressed.current.add(restKey(s.sessionId, s.restEndsAt));
    scheduled.current = null;
    await cancelRestAlert(s.sessionId);
    bump();
  }, [bump]);

  const pause = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    const k = restKey(s.sessionId, s.restEndsAt);
    suppressed.current.add(k);
    pausedKey.current = k;
    scheduled.current = null;
    await cancelRestAlert(s.sessionId);
    bump();
  }, [bump]);

  const end = useCallback(async () => {
    const s = stateRef.current;
    if (s) {
      endedSession.current = s.sessionId;
      suppressed.current.add(restKey(s.sessionId, s.restEndsAt));
      await cancelRestAlert(s.sessionId);
    }
    scheduled.current = null;
    if (support.available) await enqueue(endHandle);
    bump();
  }, [bump, enqueue, endHandle, support]);

  return {
    liveActivity: activity,
    alerts: { status: alertStatus },
    enableAlerts,
    dismissRest,
    pause,
    end,
  };
}
