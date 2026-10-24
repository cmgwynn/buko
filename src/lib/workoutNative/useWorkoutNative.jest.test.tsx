import { act, renderHook } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { AppState, type AppStateStatus } from 'react-native';
import type { WorkoutNativeState } from './types';

jest.mock('./alerts', () => ({
  getAlertStatus: jest.fn(async () => 'granted'),
  requestAlertPermission: jest.fn(async () => 'granted'),
  scheduleRestAlert: jest.fn(async () => true),
  cancelRestAlert: jest.fn(async () => undefined),
  cancelOrphanRestAlerts: jest.fn(async () => undefined),
  playRestCue: jest.fn(async () => undefined),
  releaseRestCue: jest.fn(() => undefined),
}));

type Handle = { id: string; update: jest.Mock; end: jest.Mock };
const mockNative: { support: unknown; instances: Handle[]; record: unknown; started: Handle[] } = {
  support: null,
  instances: [],
  record: null,
  started: [],
};
const mockMakeHandle = (id: string): Handle => ({ id, update: jest.fn(async () => undefined), end: jest.fn(async () => undefined) });
const mockStart = jest.fn((_props: unknown, _url?: string, _stale?: Date) => {
  const h = mockMakeHandle('started-' + (mockNative.started.length + 1));
  mockNative.started.push(h);
  return h;
});
jest.mock('./liveActivity', () => ({
  getLiveActivitySupport: () => mockNative.support,
  readActivityRecord: jest.fn(async () => mockNative.record),
  writeActivityRecord: jest.fn(async (r: unknown) => {
    mockNative.record = r;
  }),
}));

// eslint-disable-next-line import/first
import * as alerts from './alerts';
// eslint-disable-next-line import/first
import { useWorkoutNative } from './useWorkoutNative';

const mockAlerts = jest.mocked(alerts);

const NOW = Date.now();
const state = (over: Partial<WorkoutNativeState> = {}): WorkoutNativeState => ({
  sessionId: 'session-1',
  name: 'Push day',
  exerciseName: 'Bench press',
  completedSets: 1,
  totalSets: 6,
  restEndsAt: NOW + 90_000,
  active: true,
  ...over,
});
const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

let appStateListener: ((s: AppStateStatus) => void) | null = null;
const setAppState = (next: AppStateStatus) =>
  act(async () => {
    Object.defineProperty(AppState, 'currentState', { value: next, configurable: true });
    appStateListener?.(next);
  });

beforeEach(() => {
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: AppStateStatus) => void;
    return { remove: () => (appStateListener = null) } as ReturnType<typeof AppState.addEventListener>;
  });
  mockNative.instances = [];
  mockNative.record = null;
  mockNative.started = [];
  mockNative.support = { available: true, port: { start: mockStart, instances: () => mockNative.instances } };
});
afterEach(() => {
  jest.useRealTimers();
});

test('mount never prompts for notification permission; enableAlerts does', async () => {
  const { result } = await renderHook(() => useWorkoutNative(state()));
  await flush();
  expect(mockAlerts.getAlertStatus).toHaveBeenCalled();
  expect(mockAlerts.requestAlertPermission).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.enableAlerts();
  });
  expect(mockAlerts.requestAlertPermission).toHaveBeenCalledTimes(1);
});

test('schedules the rest notification and reschedules when rest is adjusted', async () => {
  const { rerender } = await renderHook((s: WorkoutNativeState) => useWorkoutNative(s), { initialProps: state() });
  await flush();
  expect(mockAlerts.scheduleRestAlert).toHaveBeenLastCalledWith('session-1', NOW + 90_000);
  await rerender(state({ restEndsAt: NOW + 105_000 }));
  await flush();
  expect(mockAlerts.cancelRestAlert).toHaveBeenCalledWith('session-1');
  expect(mockAlerts.scheduleRestAlert).toHaveBeenLastCalledWith('session-1', NOW + 105_000);
  expect(mockAlerts.scheduleRestAlert).toHaveBeenCalledTimes(2);
});

test('paused state cancels alerts and shows a paused Live Activity', async () => {
  const { rerender } = await renderHook((s: WorkoutNativeState) => useWorkoutNative(s), { initialProps: state() });
  await flush();
  await rerender(state({ paused: true, restEndsAt: null, exerciseName: 'Bench press' }));
  await flush();
  expect(mockAlerts.cancelRestAlert).toHaveBeenCalledWith('session-1');
  const lastUpdate = mockNative.started[0].update.mock.calls.at(-1)?.[0] as { paused: boolean; restEndMs: number | null };
  expect(lastUpdate).toMatchObject({ paused: true, restEndMs: null });
});

test('starts, updates and ends the Live Activity without leaking it', async () => {
  const { rerender, result } = await renderHook((s: WorkoutNativeState | null) => useWorkoutNative(s), { initialProps: state() as WorkoutNativeState | null });
  await flush();
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(result.current.liveActivity.status).toBe('active');
  expect(mockNative.record).toEqual({ activityId: 'started-1', sessionId: 'session-1' });
  const stale = mockStart.mock.calls[0][2];
  expect(stale?.getTime()).toBe(NOW + 90_000);

  await rerender(state({ completedSets: 2 }));
  await flush();
  expect(mockNative.started[0].update).toHaveBeenCalled();
  expect(mockStart).toHaveBeenCalledTimes(1);

  await rerender(null);
  await flush();
  expect(mockNative.started[0].end).toHaveBeenCalledWith('immediate');
  expect(mockNative.record).toBeNull();
});

test('end() ends the activity and it is not restarted for the same session', async () => {
  const { result, rerender } = await renderHook((s: WorkoutNativeState) => useWorkoutNative(s), { initialProps: state() });
  await flush();
  await act(async () => {
    await result.current.end();
  });
  await rerender(state({ completedSets: 3 }));
  await flush();
  expect(mockNative.started[0].end).toHaveBeenCalled();
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockAlerts.cancelRestAlert).toHaveBeenCalledWith('session-1');
});

test('relaunch ends activities from other sessions or accounts and adopts the current one', async () => {
  const mine = mockMakeHandle('mine');
  const orphan = mockMakeHandle('orphan');
  mockNative.instances = [mine, orphan];
  mockNative.record = { activityId: 'mine', sessionId: 'session-1' };
  await renderHook(() => useWorkoutNative(state()));
  await flush();
  expect(orphan.end).toHaveBeenCalledWith('immediate');
  expect(mine.end).not.toHaveBeenCalled();
  expect(mine.update).toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
});

test('waits for ready before reconciling so a restored session keeps its activity', async () => {
  const mine = mockMakeHandle('mine');
  mockNative.instances = [mine];
  mockNative.record = { activityId: 'mine', sessionId: 'session-1' };
  const { rerender } = await renderHook((p: { s: WorkoutNativeState | null; ready: boolean }) => useWorkoutNative(p.s, { ready: p.ready }), {
    initialProps: { s: null, ready: false } as { s: WorkoutNativeState | null; ready: boolean },
  });
  await flush();
  expect(mine.end).not.toHaveBeenCalled();
  await rerender({ s: state(), ready: true });
  await flush();
  expect(mine.end).not.toHaveBeenCalled();
  expect(mine.update).toHaveBeenCalled();
});

test('reports unavailable (Expo Go / web / Android) without crashing or calling native', async () => {
  mockNative.support = { available: false, reason: 'Expo Go does not include Live Activities.' };
  const { result } = await renderHook(() => useWorkoutNative(state()));
  await flush();
  expect(result.current.liveActivity).toEqual({ status: 'unavailable', reason: 'Expo Go does not include Live Activities.' });
  expect(mockStart).not.toHaveBeenCalled();
  expect(mockAlerts.scheduleRestAlert).toHaveBeenCalled();
});

test('foreground rest end plays the cue once and hands off the notification', async () => {
  jest.useFakeTimers({ now: NOW });
  const restEndsAt = NOW + 10_000;
  const { rerender } = await renderHook((s: WorkoutNativeState) => useWorkoutNative(s), { initialProps: state({ restEndsAt }) });
  await flush();
  expect(mockAlerts.scheduleRestAlert).toHaveBeenCalledWith('session-1', restEndsAt);
  await act(async () => {
    jest.advanceTimersByTime(9_000);
  });
  await flush();
  expect(mockAlerts.cancelRestAlert).toHaveBeenCalledWith('session-1');
  expect(mockAlerts.playRestCue).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1_100);
  });
  await flush();
  expect(mockAlerts.playRestCue).toHaveBeenCalledTimes(1);
  await rerender(state({ restEndsAt, completedSets: 2 }));
  await act(async () => {
    jest.advanceTimersByTime(1_000);
  });
  await flush();
  expect(mockAlerts.playRestCue).toHaveBeenCalledTimes(1);
});

test('a rest that ends while backgrounded relies on the notification and never double-alerts on return', async () => {
  jest.useFakeTimers({ now: NOW });
  const restEndsAt = NOW + 10_000;
  await renderHook(() => useWorkoutNative(state({ restEndsAt })));
  await flush();
  await setAppState('background');
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(9_000);
  });
  await flush();
  expect(mockAlerts.cancelRestAlert).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(20_000);
  });
  await setAppState('active');
  await flush();
  await act(async () => {
    jest.advanceTimersByTime(5_000);
  });
  await flush();
  expect(mockAlerts.playRestCue).not.toHaveBeenCalled();
  expect(mockAlerts.scheduleRestAlert).toHaveBeenCalledTimes(1);
});
