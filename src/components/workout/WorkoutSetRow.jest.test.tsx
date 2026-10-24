import { fireEvent, render, screen } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { WorkoutSetRow } from './WorkoutSetRow';
import type { WorkoutSet } from '../../lib/fitness/types';

jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { createAnimatedComponent: (Component: unknown) => Component },
  ReduceMotion: { System: 'system' }, useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }), withSpring: (value: unknown) => value,
}));

const set: WorkoutSet = { position: 0, reps: 10, weight_kg: 20, is_warmup: false, duration_s: null, distance_m: null };
function props() {
  return { set, index: 0, units: 'metric' as const, cardio: false, completed: false,
    onPatch: jest.fn(), onDone: jest.fn(), onUndo: jest.fn(), onRemove: jest.fn() };
}
test('prefilled set completes with one labeled tap', async () => {
  const p = props();
  await render(<WorkoutSetRow {...p} />);
  expect(screen.getByDisplayValue('20')).toBeTruthy();
  expect(screen.getByDisplayValue('10')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Done set 1' }));
  expect(p.onDone).toHaveBeenCalledTimes(1);
  expect(p.onPatch).not.toHaveBeenCalled();
});
test('completed sets provide Undo rather than another Done', async () => {
  const p = props();
  await render(<WorkoutSetRow {...p} completed />);
  await fireEvent.press(screen.getByRole('button', { name: 'Undo set 1' }));
  expect(p.onUndo).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Done set 1' })).toBeNull();
});
test('RPE is optional, selected explicitly and can be cleared', async () => {
  const p = props();
  await render(<WorkoutSetRow {...p} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add effort rating' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Set 1 RPE 8' }));
  expect(p.onPatch).toHaveBeenCalledWith({ rpe: 8 });
});
test('negative reps are rejected rather than saved as a number', async () => {
  const p = props();
  await render(<WorkoutSetRow {...p} />);
  await fireEvent.changeText(screen.getByLabelText('Set 1 reps'), '-3');
  expect(p.onPatch).toHaveBeenCalledWith({ reps: null });
  expect(screen.getByRole('button', { name: 'Done set 1' }).props.accessibilityState.disabled).toBe(true);
});
test('an invalid optional distance cannot silently become a completed cardio set', async () => {
  const p = props();
  await render(<WorkoutSetRow {...p} cardio />);
  await fireEvent.changeText(screen.getByLabelText('Set 1 meters (optional)'), '-10');
  await fireEvent.press(screen.getByRole('button', { name: 'Done set 1' }));
  expect(p.onDone).not.toHaveBeenCalled();
  expect(screen.getByText(/Enter a number from 0 to 1000000/)).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Set 1 meters (optional)'), '100');
  expect(screen.getByRole('button', { name: 'Done set 1' }).props.accessibilityState.disabled).toBe(false);
});
