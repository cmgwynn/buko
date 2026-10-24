import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, Pressable, Text, TextInput, type AppStateStatus } from 'react-native';
import { CalendarSheet } from './CalendarSheet';
import { DaySwipe } from './DaySwipe';
import { DateNavigator } from './DateNavigator';
import { WeekStrip } from './WeekStrip';
import { formatLocalDate } from '../../lib/dates';
import { SelectedDateProvider, useSelectedDate } from '../../providers/SelectedDateProvider';
import { useAuth } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase';

jest.mock('../../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
  ReduceMotion: { System: 'system' },
  runOnJS: (callback: (...args: never[]) => void) => callback,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: jest.fn(() => true),
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: jest.fn((value: unknown) => value),
}));

jest.mock('react-native-gesture-handler', () => {
  const ReactRuntime = require('react');
  const pans: Record<string, unknown>[] = [];
  function createPan() {
    const gesture: Record<string, unknown> = { callbacks: {}, blocks: [] };
    for (const name of ['activeOffsetX', 'failOffsetY', 'runOnJS', 'maxPointers']) {
      gesture[name] = () => gesture;
    }
    for (const name of ['onEnd', 'onTouchesDown', 'onTouchesMove', 'onStart']) {
      gesture[name] = (callback: unknown) => {
        (gesture.callbacks as Record<string, unknown>)[name] = callback;
        return gesture;
      };
    }
    gesture.blocksExternalGesture = (external: unknown) => {
      (gesture.blocks as unknown[]).push(external);
      return gesture;
    };
    pans.push(gesture);
    return gesture;
  }
  return {
    Gesture: { Pan: createPan },
    GestureDetector: ({ children }: React.PropsWithChildren) => ReactRuntime.createElement(ReactRuntime.Fragment, null, children),
    __getPans: () => pans,
    __invokePanEnd: (event: { translationX: number; translationY?: number }, successful = true) => {
      const callback = (pans.at(-1)?.callbacks as Record<string, (...args: unknown[]) => void>)?.onEnd;
      callback?.({ translationY: 0, ...event }, successful);
    },
  };
});

function DateProbe() {
  const { selectedDate, today, setSelectedDate, goToday } = useSelectedDate();
  return (
    <>
      <Text testID="selected-date">{selectedDate}</Text>
      <Text testID="today-date">{today}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Select a past date" onPress={() => setSelectedDate('2026-05-11')}>
        <Text>Select date</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Go to today" onPress={goToday}>
        <Text>Go to today</Text>
      </Pressable>
    </>
  );
}

function Provider({ children }: React.PropsWithChildren) {
  return <SelectedDateProvider>{children}</SelectedDateProvider>;
}

function localDateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function queryFor(result: Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'lt', 'limit', 'order', 'range']) {
    query[method] = jest.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    result.then(resolve, reject);
  return query;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.useRealTimers();
  (useAuth as jest.Mock).mockReset();
  (supabase.from as jest.Mock).mockReset();
});

interface MockPan {
  callbacks: {
    onEnd: (event: { translationX: number; translationY: number }, successful: boolean) => void;
    onTouchesDown: (event: unknown, manager: { fail: () => void }) => void;
    onTouchesMove: (event: unknown, manager: { fail: () => void }) => void;
    onStart: () => void;
  };
  blocks: MockPan[];
}

function latestPan(): MockPan {
  const gestureMock = jest.requireMock('react-native-gesture-handler') as { __getPans: () => MockPan[] };
  return gestureMock.__getPans().at(-1)!;
}

test('day swipes ignore vertical, cancelled, long-pressed and focused-input touches', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 12));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  const focus = jest.spyOn(TextInput.State, 'currentlyFocusedInput')
    .mockReturnValue(null as unknown as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
  await render(<Provider><DaySwipe><DateProbe /></DaySwipe></Provider>);
  const manager = { fail: jest.fn() };
  const pan = latestPan();

  await act(async () => {
    pan.callbacks.onTouchesDown({}, manager);
    pan.callbacks.onEnd({ translationX: -80, translationY: 80 }, true);
    pan.callbacks.onEnd({ translationX: -80, translationY: 0 }, false);
  });
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-13');

  await act(async () => {
    pan.callbacks.onTouchesDown({}, manager);
    jest.advanceTimersByTime(300);
    pan.callbacks.onTouchesMove({}, manager);
    pan.callbacks.onEnd({ translationX: -80, translationY: 0 }, true);
  });
  expect(manager.fail).toHaveBeenCalled();
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-13');

  focus.mockReturnValue({} as ReturnType<typeof TextInput.State.currentlyFocusedInput>);
  await act(async () => {
    pan.callbacks.onTouchesDown({}, manager);
    pan.callbacks.onEnd({ translationX: -80, translationY: 0 }, true);
  });
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-13');
});

test('nested WeekStrip blocks the outer day gesture and preserves weekday', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 12));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  await render(<Provider><DaySwipe><WeekStrip /><DateProbe /></DaySwipe></Provider>);
  const childPan = latestPan();
  const parentPan = childPan.blocks[0];
  expect(parentPan).toBeDefined();
  await act(async () => {
    childPan.callbacks.onEnd({ translationX: -80, translationY: 0 }, true);
    parentPan.callbacks.onEnd({ translationX: -80, translationY: 0 }, false);
  });
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-20');
});

test('reduced motion skips day transition timing and calendar slide animation', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 12));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  const reanimated = jest.requireMock('react-native-reanimated') as { withTiming: jest.Mock };
  await render(
    <Provider>
      <DaySwipe><DateProbe /></DaySwipe>
      <CalendarSheet visible onClose={() => {}} />
    </Provider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Select a past date' }));
  expect(reanimated.withTiming).not.toHaveBeenCalled();
  expect(screen.getByTestId('date-calendar-sheet').props.animationType).toBe('none');
});

test('normal motion animates date transitions but not the initial view', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 12));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  const reanimated = jest.requireMock('react-native-reanimated') as {
    useReducedMotion: jest.Mock<() => boolean>;
    withTiming: jest.Mock;
  };
  reanimated.useReducedMotion.mockReturnValueOnce(false).mockReturnValueOnce(false);
  await render(<Provider><DaySwipe><DateProbe /></DaySwipe></Provider>);
  expect(reanimated.withTiming).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Select a past date' }));
  expect(reanimated.withTiming).toHaveBeenCalledWith(0.92, { duration: 70, reduceMotion: 'system' }, expect.any(Function));
});

test('Today can restore following today even after explicitly selecting the current date', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 23, 59, 59));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  await render(<Provider><DateNavigator /><DateProbe /></Provider>);
  await fireEvent.press(screen.getByRole('button', { name: localDateLabel('2026-05-13') }));
  await fireEvent.press(screen.getByRole('button', { name: 'Today' }));
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-14');
});

test('explicit selections stay fixed at midnight while today advances', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 23, 59, 59));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  await render(<Provider><DateProbe /></Provider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Select a past date' }));
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(screen.getByTestId('today-date').props.children).toBe('2026-05-14');
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-11');
});

test('account changes reset the date and resume only follows today when opted in', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 12));
  let onResume: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    onResume = listener;
    return { remove: jest.fn() };
  });
  (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'account-a' } } });
  const result = await render(<Provider><DateProbe /></Provider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Select a past date' }));
  (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'account-b' } } });
  await result.rerender(<Provider><DateProbe /></Provider>);
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-13');

  await fireEvent.press(screen.getByRole('button', { name: 'Select a past date' }));
  await act(async () => {
    jest.setSystemTime(new Date(2026, 4, 14, 12));
    onResume('active');
  });
  expect(screen.getByTestId('today-date').props.children).toBe('2026-05-14');
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-11');

  await fireEvent.press(screen.getByRole('button', { name: 'Go to today' }));
  await act(async () => {
    jest.setSystemTime(new Date(2026, 4, 15, 12));
    onResume('active');
  });
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-15');
});

test('WeekStrip swipes by a week and DaySwipe changes the selected day', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 4, 13, 12));
  (useAuth as jest.Mock).mockReturnValue({ session: null });
  const gestureMock = jest.requireMock('react-native-gesture-handler') as {
    __invokePanEnd: (event: { translationX: number }) => void;
  };

  await render(<Provider><WeekStrip /><DateProbe /></Provider>);
  await act(async () => gestureMock.__invokePanEnd({ translationX: -80 }));
  expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-20');

  await render(<Provider><DaySwipe><DateProbe /></DaySwipe></Provider>);
  await act(async () => gestureMock.__invokePanEnd({ translationX: -80 }));
  expect(screen.getAllByTestId('selected-date').at(-1)?.props.children).toBe('2026-05-14');
});

describe('date selection components', () => {
  test('calendar paginates the visible account-scoped range beyond 1000 entries', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'account-1' } } });
    const queries: ReturnType<typeof queryFor>[] = [];
    (supabase.from as jest.Mock).mockImplementation((table: unknown) => {
      const query = queryFor(Promise.resolve({ data: [], error: null }));
      query.range = jest.fn((from: number) => {
        const data = table === 'food_log_entries'
          ? from < 1000 ? Array(500).fill({ logged_on: '2026-05-01' }) : [{ logged_on: '2026-05-31' }]
          : [];
        return Promise.resolve({ data, error: null });
      });
      queries.push(query);
      return query;
    });
    await render(<Provider><CalendarSheet visible selectedDate="2026-05-13" onClose={() => {}} /></Provider>);
    expect(await screen.findByRole('button', { name: `${localDateLabel('2026-05-31')}, food logged` })).toBeTruthy();
    expect(queries).toHaveLength(4);
    for (const query of queries) expect(query.eq).toHaveBeenCalledWith('user_id', 'account-1');
    expect(queries[0].gte).toHaveBeenCalledWith('logged_on', '2026-05-01');
    expect(queries[0].lte).toHaveBeenCalledWith('logged_on', '2026-05-31');
    expect(queries[1].gte).toHaveBeenCalledWith('started_at', new Date(2026, 4, 1).toISOString());
    expect(queries[1].lt).toHaveBeenCalledWith('started_at', new Date(2026, 5, 1).toISOString());
    expect(queries.at(-1)?.range).toHaveBeenCalledWith(1000, 1499);
  });

  test('calendar ignores pending markers from the previous account', async () => {
    const oldFood = deferred<{ data: unknown[]; error: null }>();
    const oldWorkouts = deferred<{ data: unknown[]; error: null }>();
    const oldSession = { user: { id: 'old-account' } };
    (useAuth as jest.Mock).mockReturnValue({ session: oldSession });
    (supabase.from as jest.Mock)
      .mockImplementationOnce(() => queryFor(oldFood.promise))
      .mockImplementationOnce(() => queryFor(oldWorkouts.promise))
      .mockImplementation(() => queryFor(Promise.resolve({ data: [], error: null })));
    const result = await render(<Provider><CalendarSheet visible selectedDate="2026-05-13" onClose={() => {}} /></Provider>);
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'new-account' } } });
    await result.rerender(<Provider><CalendarSheet visible selectedDate="2026-05-13" onClose={() => {}} /></Provider>);
    await act(async () => {
      oldFood.resolve({ data: [{ logged_on: '2026-05-20' }], error: null });
      oldWorkouts.resolve({ data: [{ started_at: new Date(2026, 4, 20, 12).toISOString() }], error: null });
      await Promise.all([oldFood.promise, oldWorkouts.promise]);
    });
    expect(screen.getByRole('button', { name: localDateLabel('2026-05-20') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /May 20.*logged/ })).toBeNull();
  });

  test('WeekStrip selects a day and the provider tracks explicit selection', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 13, 12));
    (useAuth as jest.Mock).mockReturnValue({ session: null });
    await render(<Provider><WeekStrip /><DateProbe /></Provider>);

    const monday = '2026-05-11';
    await fireEvent.press(screen.getByRole('button', { name: localDateLabel(monday) }));
    expect(screen.getByTestId('selected-date').props.children).toBe(monday);
    expect(screen.getByRole('button', { name: localDateLabel(monday) }).props.accessibilityState.selected).toBe(true);
  });

  test('DateNavigator preserves the selected weekday across weeks and Today restores the current date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 13, 12));
    (useAuth as jest.Mock).mockReturnValue({ session: null });
    await render(<Provider><DateNavigator /><DateProbe /></Provider>);

    await fireEvent.press(screen.getByRole('button', { name: 'Select a past date' }));
    expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-11');
    await fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByTestId('selected-date').props.children).toBe('2026-05-18');
    await fireEvent.press(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByTestId('selected-date').props.children).toBe(formatLocalDate(new Date()));
  });

  test('CalendarSheet selects future dates and reports date-history errors accessibly', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 13, 12));
    (useAuth as jest.Mock).mockReturnValue({ session: null });
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const { rerender } = await render(
      <Provider>
        <CalendarSheet visible selectedDate="2026-05-13" onSelect={onSelect} onClose={onClose} />
      </Provider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: localDateLabel('2026-05-20') }));
    expect(onSelect).toHaveBeenCalledWith('2026-05-20');
    expect(onClose).toHaveBeenCalled();

    const food = deferred<{ data: unknown[] | null; error: { message: string } | null }>();
    const workouts = deferred<{ data: unknown[] | null; error: { message: string } | null }>();
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'account-1' } } });
    (supabase.from as jest.Mock)
      .mockImplementationOnce(() => queryFor(food.promise))
      .mockImplementationOnce(() => queryFor(workouts.promise));
    await rerender(
      <Provider>
        <CalendarSheet visible selectedDate="2026-05-13" onSelect={onSelect} onClose={onClose} />
      </Provider>,
    );

    expect(screen.getByText('Loading date history…')).toBeTruthy();
    await act(async () => {
      food.resolve({ data: null, error: { message: 'offline' } });
      workouts.resolve({ data: [], error: null });
      await Promise.all([food.promise, workouts.promise]);
    });
    expect((await screen.findByRole('alert')).props.children).toContain('Could not load date history: offline');
  });
});
