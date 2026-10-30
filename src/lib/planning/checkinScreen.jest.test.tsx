import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CheckIn from '../../../app/checkin';

const mockPush = jest.fn();
const mockApply = jest.fn<(...args: unknown[]) => Promise<number>>();
const mockMark = jest.fn<(...args: unknown[]) => Promise<void>>();
let mockAllowed = true;
const plan = (id: string, date: string, done: boolean) => ({
  id, user_id: 'u', planned_for: date, name: id, routine_id: null, notes: null, updated_at: 't',
  snapshot: [], completed_workout_id: done ? 'w' : null,
});
// Today is Monday 2026-11-09: review 11-02..11-08, the coming week starts today.
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('../../providers/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'u' } } }) }));
jest.mock('../../providers/BillingProvider', () => ({ useBilling: () => ({ allowed: mockAllowed }) }));
jest.mock('../../providers/ProfileProvider', () => ({ useProfile: () => ({ profile: null, targets: null, today: '2026-11-09' }) }));
jest.mock('../../providers/SelectedDateProvider', () => ({ useSelectedDate: () => ({ setSelectedDate: jest.fn() }) }));
jest.mock('../fitness/data', () => ({
  loadPlannedWorkouts: async () => [plan('a', '2026-11-03', true), plan('b', '2026-11-05', false), plan('c', '2026-11-07', false), plan('next', '2026-11-10', false)],
  loadMeasurements: async () => [],
}));
jest.mock('../supabase', () => {
  const query = (rows: unknown[]) => ({ select: () => ({ gte: () => ({ lte: async () => ({ data: rows, error: null }) }) }) });
  return { supabase: { from: (table: string) => table === 'food_log_entries'
    ? query([{ logged_on: '2026-11-02' }, { logged_on: '2026-11-03' }])
    : query([{ planned_on: '2026-11-03', logged_at: null }]) } };
});
jest.mock('./checkinClient', () => ({
  checkinDone: async () => false,
  applyCheckin: (...args: unknown[]) => mockApply(...args),
  markCheckinDone: (...args: unknown[]) => mockMark(...args),
}));
jest.mock('../../components/ui', () => {
  const React = require('react');
  const { Text, Pressable, View } = require('react-native');
  const box = ({ children }: { children: unknown }) => React.createElement(View, null, children);
  const text = ({ children }: { children: unknown }) => React.createElement(Text, null, children);
  const press = ({ title, label, onPress }: { title?: string; label?: string; onPress: () => void }) =>
    React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: title ?? label, onPress }, React.createElement(Text, null, title ?? label));
  return { Screen: box, Card: box, HeroCard: box, ChipRow: box, Eyebrow: text, Notice: text, Loading: () => null, Button: press, Chip: press };
});

beforeEach(() => { mockAllowed = true; mockPush.mockReset(); mockApply.mockReset().mockResolvedValue(1); mockMark.mockReset().mockResolvedValue(undefined); });

test('summarizes the week and eases the coming week after low adherence', async () => {
  await render(<CheckIn />);
  expect(await screen.findByText('1/3')).toBeTruthy();
  expect(screen.getByText('2/7')).toBeTruthy();
  expect(screen.getByText('Ease off a little')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Apply to this week' }));
  expect(mockApply).toHaveBeenCalledWith('u', '2026-11-02', [expect.objectContaining({ id: 'next' })], 'ease');
  expect(mockMark).toHaveBeenCalledWith('u', '2026-11-02', 'ease');
  expect(await screen.findByText('Updated 1 workout for this week.')).toBeTruthy();
});

test('without Plus, adapting opens the paywall and changes nothing', async () => {
  mockAllowed = false;
  await render(<CheckIn />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Apply with Buko Plus' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/premium', params: { from: 'checkin' } });
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockMark).not.toHaveBeenCalled();
});
