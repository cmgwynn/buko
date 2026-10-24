import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { RecipeTasteFeedback } from './RecipeTasteFeedback';
import { RecipeQualityLabel } from './RecipeQualityLabel';
import type { TasteFeedback } from '../lib/recipes/qualityClient';

const mockSave = jest.fn<(value: TasteFeedback) => Promise<void>>();
const mockProvenance = jest.fn<() => Promise<{ label: string | null; baseTitle: string | null; note: string | null }>>();
jest.mock('expo-crypto', () => ({ randomUUID: () => 'persistent-event-id' }));
jest.mock('../lib/recipes/qualityClient', () => ({
  FEEDBACK_TAGS: ['too bland', 'too salty', 'too complicated', 'family loved it'],
  saveTasteFeedback: (value: TasteFeedback) => mockSave(value),
  loadQualityProvenance: () => mockProvenance(),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { createAnimatedComponent: (Component: unknown) => Component },
  ReduceMotion: { System: 'system' }, useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }), withSpring: (value: unknown) => value,
}));
beforeEach(() => {
  mockSave.mockReset(); mockSave.mockResolvedValue();
  mockProvenance.mockReset(); mockProvenance.mockResolvedValue({ label: null, baseTitle: null, note: null });
});
test('taste feedback is optional and Skip makes no server request', async () => {
  await render(<RecipeTasteFeedback recipeId="recipe" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Skip feedback' }));
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.queryByText('How did it taste?')).toBeNull();
});
test('failed feedback keeps selections and the same cooking-event id for retry', async () => {
  mockSave.mockRejectedValueOnce(new Error('Offline; retry when connected.'));
  await render(<RecipeTasteFeedback recipeId="recipe" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Thumbs down' }));
  await fireEvent.press(screen.getByRole('button', { name: 'too salty' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save taste feedback' }));
  await screen.findByText('Offline; retry when connected.');
  await fireEvent.press(screen.getByRole('button', { name: 'Save taste feedback' }));
  await screen.findByText('Thanks for the taste feedback');
  expect(mockSave).toHaveBeenCalledTimes(2);
  expect(mockSave.mock.calls[0][0]).toEqual(mockSave.mock.calls[1][0]);
  expect(mockSave.mock.calls[0][0]).toMatchObject({ thumb: false, makeAgain: null, tags: ['too salty'], eventId: 'persistent-event-id' });
});
test('unknown/unverified recipes never receive a Tested label', async () => {
  await render(<RecipeQualityLabel recipeId="unverified" />);
  await waitFor(() => expect(mockProvenance).toHaveBeenCalled());
  expect(screen.queryByText(/Tested/)).toBeNull();
});
test('server-verified adaptations display their base and review note', async () => {
  mockProvenance.mockResolvedValue({ label: 'Adapted', baseTitle: 'Lentil stew', note: 'Adjusted portions; reviewed, not kitchen-tested.' });
  await render(<RecipeQualityLabel recipeId="adapted" />);
  await screen.findByText('Adapted · Based on Lentil stew');
  expect(screen.getByText('Adjusted portions; reviewed, not kitchen-tested.')).toBeTruthy();
});
