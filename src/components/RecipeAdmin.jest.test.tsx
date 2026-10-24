import { beforeEach, expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import RecipeAdmin from '../../app/recipe/admin';

const mockAdmin = jest.fn<() => Promise<boolean>>();
const mockList = jest.fn<() => Promise<unknown[]>>();
const mockSaved = jest.fn<() => Promise<unknown>>();
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { useRouter: () => ({ push: jest.fn() }), useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]) };
});
jest.mock('./ConfirmProvider', () => ({ useConfirm: () => jest.fn() }));
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('../lib/recipes/db', () => ({ loadRecipe: jest.fn() }));
jest.mock('../lib/recipes/qualityClient', () => ({
  isRecipeAdmin: () => mockAdmin(), loadCuratedVersions: () => mockList(), loadQualityFlags: async () => [],
}));
jest.mock('../lib/supabase', () => ({ supabase: { from: () => { mockSaved(); throw new Error('Non-admin must not query saved recipes here.'); } } }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { createAnimatedComponent: (Component: unknown) => Component },
  ReduceMotion: { System: 'system' }, useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }), withSpring: (value: unknown) => value,
}));
beforeEach(() => { mockAdmin.mockReset(); mockList.mockClear(); mockSaved.mockClear(); });
test('non-admin deep links never render curation or fetch drafts', async () => {
  mockAdmin.mockResolvedValue(false);
  await render(<RecipeAdmin />);
  await screen.findByText('Only recipe admins can access curation. Access is verified on the server.');
  expect(mockList).not.toHaveBeenCalled();
  expect(mockSaved).not.toHaveBeenCalled();
  expect(screen.queryByText('Save curated draft')).toBeNull();
});
test('an admin lookup failure does not grant access', async () => {
  mockAdmin.mockRejectedValue(new Error('Admin lookup is offline.'));
  await render(<RecipeAdmin />);
  await screen.findByText('Admin lookup is offline.');
  expect(mockList).not.toHaveBeenCalled();
  expect(screen.queryByText('Save curated draft')).toBeNull();
});
