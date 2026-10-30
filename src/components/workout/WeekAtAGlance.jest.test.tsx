import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { WeekAtAGlance, planKind } from './WeekAtAGlance';

const mockSetDate = jest.fn<(date: string) => void>();
const mockPush = jest.fn<(href: string) => void>();
let mockPlans: unknown[] = [];
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void) => { const React = require('react'); React.useEffect(effect, [effect]); },
}));
jest.mock('../../providers/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('../../providers/SelectedDateProvider', () => ({
  useSelectedDate: () => ({ selectedDate: '2026-10-28', setSelectedDate: mockSetDate, today: '2026-10-28' }),
}));
jest.mock('../ui', () => {
  const React = require('react');
  const { Text, Pressable, View } = require('react-native');
  return {
    Card: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    Eyebrow: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    Button: ({ title, onPress }: { title: string; onPress: () => void }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', onPress }, React.createElement(Text, null, title)),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../lib/fitness/data', () => ({ loadPlannedWorkouts: async () => mockPlans }));

const run = { exercise: { name: 'Running', category: 'cardio' } };
const squat = { exercise: { name: 'Squat', category: 'strength' } };
const plan = (id: string, date: string, snapshot: unknown[], done = false) =>
  ({ id, planned_for: date, name: id, snapshot, completed_workout_id: done ? 'w' : null });

beforeEach(() => { mockSetDate.mockReset(); mockPush.mockReset(); });

test('classifies run and strength sessions', () => {
  expect(planKind(plan('a', '', [run]) as never)).toBe('run');
  expect(planKind(plan('b', '', [squat]) as never)).toBe('strength');
});

test('empty week offers the plan builder', async () => {
  mockPlans = [];
  await render(<WeekAtAGlance />);
  await fireEvent.press(await screen.findByText('Build my plan'));
  expect(mockPush).toHaveBeenCalledWith('/workout/plan');
});

test('planned week shows progress and selects a tapped day', async () => {
  mockPlans = [plan('Easy run', '2026-10-26', [run], true), plan('Strength', '2026-10-29', [squat])];
  await render(<WeekAtAGlance />);
  expect(await screen.findByText(/1\/2 done/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(/Strength$/));
  expect(mockSetDate).toHaveBeenCalledWith('2026-10-29');
  expect(screen.getByLabelText(/Easy run, done$/)).toBeTruthy();
});
