import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FinishWorkout from '../../../app/workout/finish';

const mockConfirm = jest.fn<() => Promise<boolean>>();
const mockFinish = jest.fn<() => Promise<never>>();
const mockUpdate = jest.fn<(update: (session: typeof mockWorkout) => typeof mockWorkout) => void>();
const mockPause = jest.fn();
const mockRouter = { replace: jest.fn(), setParams: jest.fn() };
const mockMode = { pending: 0, syncing: false, online: false, refresh: jest.fn(), retry: jest.fn(), native: { liveActivity: { status: 'unavailable' } } };
const mockWorkout = {
  active: true, notes: '', pausedAt: 1,
  items: [{ sets: [{ completed_at: '2026-10-24T12:00:00Z' }, { completed_at: null }] }],
};
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { createAnimatedComponent: (Component: unknown) => Component },
  ReduceMotion: { System: 'system' }, useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }), withSpring: (value: unknown) => value,
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => mockRouter }));
jest.mock('../ConfirmProvider', () => ({ useConfirm: () => mockConfirm }));
jest.mock('../../providers/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('../../providers/ProfileProvider', () => ({ useProfile: () => ({ profile: { units: 'metric' } }) }));
jest.mock('../../providers/SettingsProvider', () => ({ useSettings: () => ({ settings: { health_write_workouts: false } }) }));
jest.mock('../../providers/WorkoutModeProvider', () => ({ useWorkoutMode: () => mockMode }));
jest.mock('../../lib/fitness/session', () => ({
  useWorkoutSession: () => mockWorkout, updateSession: (update: (session: typeof mockWorkout) => typeof mockWorkout) => mockUpdate(update),
  useWorkoutRecovery: () => ({ ready: true, error: null }),
  pauseSession: () => mockPause(), resumeSession: jest.fn(),
}));
jest.mock('../../lib/fitness/offline', () => ({ getFinishedWorkout: jest.fn() }));
jest.mock('../../lib/fitness/data', () => ({
  summarizeActiveWorkout: async () => ({ durationSec: 60, volumeKg: 100, completedSets: 1, records: [] }),
  finishWorkoutOffline: () => mockFinish(),
}));

beforeEach(() => {
  mockConfirm.mockReset(); mockFinish.mockReset(); mockUpdate.mockClear();
  mockConfirm.mockResolvedValue(false);
});
test('finish review continuously persists workout notes', async () => {
  await render(<FinishWorkout />);
  await screen.findByText('Save finished workout');
  await fireEvent.changeText(screen.getByLabelText('Workout notes (optional)'), 'Felt strong');
  expect(mockUpdate.mock.calls.at(-1)?.[0](mockWorkout)).toMatchObject({ notes: 'Felt strong' });
});
test('the optional finish rating is part of the continuously saved session', async () => {
  await render(<FinishWorkout />);
  await screen.findByText('Save finished workout');
  await fireEvent.press(screen.getByRole('button', { name: 'Hard' }));
  expect(mockUpdate.mock.calls.at(-1)?.[0](mockWorkout)).toMatchObject({ finishRating: 'hard' });
});
test('a second save tap cannot open a second confirmation or finish while the first is pending', async () => {
  let answer: (value: boolean) => void = () => { throw new Error('Confirmation has not opened.'); };
  mockConfirm.mockImplementation(() => new Promise<boolean>((resolve) => { answer = resolve; }));
  await render(<FinishWorkout />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save finished workout' }).props.accessibilityState?.disabled).not.toBe(true));
  await fireEvent.press(screen.getByRole('button', { name: 'Save finished workout' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save finished workout' }));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockFinish).not.toHaveBeenCalled();
  await act(async () => { answer(false); });
});
