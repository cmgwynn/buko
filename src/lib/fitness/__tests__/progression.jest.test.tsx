import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { WeeklyTrainingPlan } from '../../../components/workout/WeeklyTrainingPlan';
import { trainingAddDays } from '../progression';
import { toDateString } from '../../diary';
import type { PlannedWorkoutRow } from '../data';
import type { PlanningPreferences } from '../../planning/preferences';
import type { TrainingSaveOperation } from '../progression';

const mockConfirm = jest.fn<() => Promise<boolean>>();
const mockSaveSlot = jest.fn<(owner: string, operation: TrainingSaveOperation) => Promise<void>>();
const mockLoadPreferences = jest.fn<() => Promise<PlanningPreferences>>();
const mockSavePreferences = jest.fn<(owner: string, value: PlanningPreferences) => Promise<PlanningPreferences>>();
const mockLoadPlans = jest.fn<() => Promise<PlannedWorkoutRow[]>>();
let mockAccount = 'owner';
let mockActive = false;
let mockAllowed = true;
const mockPush = jest.fn();
let mockPreferences: PlanningPreferences;
const mockCatalog = ['Running', 'Glute Bridge', 'Push-Up', 'Crunch'].map((name, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`, name, category: index === 0 ? 'cardio' : 'strength',
  user_id: null, muscle_groups: [], equipment: null, met: 4,
}));
const today = toDateString(new Date());
const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
const mockStartDate = trainingAddDays(today, (8 - weekday) % 7 || 7);
const mockExisting = (id: string, completed = false): PlannedWorkoutRow => ({
  id, user_id: 'owner', planned_for: mockStartDate, name: id, routine_id: null,
  notes: 'Original', snapshot: [], completed_workout_id: completed ? 'workout' : null,
  updated_at: '2026-10-29T12:00:00Z',
});

jest.mock('../../../providers/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: mockAccount } } }) }));
jest.mock('../../../providers/ProfileProvider', () => ({ useProfile: () => ({ profile: { units: 'metric' } }) }));
jest.mock('../../../providers/BillingProvider', () => ({ useBilling: () => ({ allowed: mockAllowed }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../components/date/DateField', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return { DateField: ({ label, value, onChange }: { label: string; value: string; onChange: (date: string) => void }) =>
    React.createElement(TextInput, { accessibilityLabel: label, value, onChangeText: onChange }) };
});
jest.mock('../../../components/ConfirmProvider', () => ({ useConfirm: () => mockConfirm }));
jest.mock('../../../components/ui', () => {
  const React = require('react');
  const { Text, TextInput, Pressable, View } = require('react-native');
  return {
    Card: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    Heading: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    Eyebrow: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    Step: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    Disclosure: ({ title, children }: { title: string; children: unknown }) => React.createElement(View, null, React.createElement(Text, null, title), children),
    Notice: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    ChipRow: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    Button: ({ title, onPress, disabled, loading }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: title, onPress, disabled: disabled || loading, accessibilityState: { disabled: disabled || loading } }, React.createElement(Text, null, title)),
    Chip: ({ label, onPress, selected, disabled }: { label: string; onPress: () => void; selected?: boolean; disabled?: boolean }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: label, onPress, disabled, accessibilityState: { selected, disabled } }, React.createElement(Text, null, label)),
    TextField: ({ label, ...props }: { label: string }) => React.createElement(TextInput, { accessibilityLabel: label, ...props }),
  };
});
jest.mock('../session', () => ({
  getSession: () => ({ active: mockActive }),
  workoutSessionStore: { getAccount: () => mockAccount },
}));
jest.mock('../data', () => ({
  loadExercises: async () => mockCatalog,
  loadPlannedWorkouts: () => mockLoadPlans(),
}));
jest.mock('../progressionStorage', () => ({
  saveTrainingSlot: (owner: string, operation: TrainingSaveOperation) => mockSaveSlot(owner, operation),
}));
jest.mock('../../planning/preferences', () => ({
  loadPlanningPreferences: () => mockLoadPreferences(),
  savePlanningPreferences: (owner: string, value: PlanningPreferences) => mockSavePreferences(owner, value),
}));

beforeEach(() => {
  mockAccount = 'owner'; mockActive = false;
  mockAllowed = true; mockPush.mockReset();
  mockPreferences = { excludedFoods: ['milk'], excludedExercises: [] };
  mockLoadPreferences.mockReset().mockImplementation(async () => mockPreferences);
  mockSavePreferences.mockReset().mockImplementation(async (_, value) => { mockPreferences = value; return value; });
  mockLoadPlans.mockReset().mockResolvedValue([]);
  mockConfirm.mockReset().mockResolvedValue(false);
  mockSaveSlot.mockReset().mockResolvedValue(undefined);
});

async function open() {
  await render(<WeeklyTrainingPlan />);
  await fireEvent.press(screen.getByRole('button', { name: 'Build a training plan' }));
  await screen.findByLabelText('Or pick a start date');
  await fireEvent.changeText(screen.getByLabelText('Or pick a start date'), mockStartDate);
}
async function preview() {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Preview my 4-week plan' }));
  await screen.findByText('Review all four weeks');
}

test('generation is preview-only, full four weeks are visible, and cancelling confirmation writes nothing', async () => {
  await preview();
  expect(screen.getAllByText(/Week [1-4] ·/)).toHaveLength(28);
  expect(mockSaveSlot).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }));
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('editing a preview target requires confirmation and saves uncompleted snapshots only', async () => {
  await preview();
  await fireEvent.changeText(screen.getByLabelText('Workout 1 Running minutes'), '9');
  await fireEvent.changeText(screen.getByLabelText('Workout 1 name'), 'My comfortable run');
  mockConfirm.mockResolvedValue(true);
  await fireEvent.press(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }));
  await screen.findByText(/Saved 16 workouts/);
  expect(mockSaveSlot.mock.calls[0][0]).toBe('owner');
  expect(mockSaveSlot.mock.calls[0][1].day).toMatchObject({
    name: 'My comfortable run', snapshot: [{ sets: [{ duration_s: 540, completed: false, completed_at: null }] }],
  });
  expect(mockSaveSlot.mock.calls.every(([, operation]) => operation.replace === null)).toBe(true);
});

test('occupied dates are preserved unless one specific uncompleted slot is selected', async () => {
  const existing = [mockExisting('replace me'), mockExisting('keep me'), mockExisting('completed', true)];
  mockLoadPlans.mockResolvedValue(existing);
  await preview();
  expect(screen.getByRole('button', { name: 'Include workout 1' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: `Replace existing completed on ${mockStartDate}` })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: `Replace existing replace me on ${mockStartDate}` }));
  mockConfirm.mockResolvedValue(true);
  await fireEvent.press(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }));
  await screen.findByText(/Saved 16 workouts/);
  expect(mockSaveSlot.mock.calls[0][1].replace?.id).toBe('replace me');
  expect(mockSaveSlot.mock.calls.some(([, operation]) => ['keep me', 'completed'].includes(operation.replace?.id ?? ''))).toBe(false);
});

test('saving exclusions preserves food preferences and excluded running produces no run targets', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Running' }));
  expect(screen.getByRole('button', { name: 'Preview my 4-week plan' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Save exercise exclusions' }));
  await screen.findByText(/Exercise exclusions saved/);
  expect(mockSavePreferences).toHaveBeenCalledWith('owner', {
    excludedFoods: ['milk'], excludedExercises: [mockCatalog[0].id],
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Preview my 4-week plan' }));
  await screen.findByText('Review all four weeks');
  expect(screen.queryByLabelText('Workout 1 Running minutes')).toBeNull();
  expect(screen.getByText(/No running sessions were created/)).toBeTruthy();
});

test('missing preference storage fails closed without generating or saving', async () => {
  mockLoadPreferences.mockRejectedValue(new Error('planning_preferences unavailable'));
  await render(<WeeklyTrainingPlan />);
  await fireEvent.press(screen.getByRole('button', { name: 'Build a training plan' }));
  expect(await screen.findByText('planning_preferences unavailable')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Preview my 4-week plan' })).toBeNull();
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('changed or completed replacements are rejected before confirmation and writes', async () => {
  mockLoadPlans.mockResolvedValue([mockExisting('slot')]);
  await preview();
  await fireEvent.press(screen.getByRole('button', { name: `Replace existing slot on ${mockStartDate}` }));
  mockLoadPlans.mockResolvedValue([mockExisting('slot', true)]);
  await fireEvent.press(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }));
  expect(await screen.findByText(/selected replacement changed/)).toBeTruthy();
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('live workout blocks saving even if it starts while preview is open', async () => {
  await preview();
  mockActive = true;
  await fireEvent.press(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }));
  expect(await screen.findByText(/Finish or discard your live workout/)).toBeTruthy();
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('partial save failure blocks retries until regeneration and reports persisted slots', async () => {
  await preview();
  mockConfirm.mockResolvedValue(true);
  mockSaveSlot.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network disconnected'));
  await fireEvent.press(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }));
  expect(await screen.findByText(/1 workouts saved.*Regenerate the preview before retrying/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Save \d+ workouts to my plan$/ }).props.accessibilityState.disabled).toBe(true);
  expect(mockSaveSlot).toHaveBeenCalledTimes(2);
});

test('account changes clear the previous account preview and saved exclusions', async () => {
  await preview();
  mockAccount = 'other';
  await screen.rerender(<WeeklyTrainingPlan />);
  await waitFor(() => expect(screen.queryByText('Review all four weeks')).toBeNull());
  expect(screen.getByRole('button', { name: 'Build a training plan' })).toBeTruthy();
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('autoOpen loads the setup form on arrival without generating or saving', async () => {
  await render(<WeeklyTrainingPlan autoOpen />);
  expect(await screen.findByLabelText('Or pick a start date')).toBeTruthy();
  expect(screen.queryByText('Review all four weeks')).toBeNull();
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('without Buko Plus the preview stays free but saving opens the paywall', async () => {
  mockAllowed = false;
  await preview();
  expect(screen.getByText(/Previews are free/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save with Buko Plus' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/premium', params: { from: 'training-plan' } });
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockSaveSlot).not.toHaveBeenCalled();
});

test('choosing a strength split previews named split sessions instead of runs', async () => {
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Full body' }));
  expect(screen.queryByLabelText('Easy run/walk minutes today (5–60)')).toBeNull();
  expect(screen.getByRole('button', { name: 'Full gym' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Preview my 4-week plan' }));
  await screen.findByText('Review all four weeks');
  expect(screen.getAllByText(/^Full body [AB]$/).length).toBeGreaterThan(0);
  expect(screen.queryByText('Easy run / walk')).toBeNull();
});
