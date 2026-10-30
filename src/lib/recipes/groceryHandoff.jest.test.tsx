import { expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import GenerateGrocery from '../../../app/grocery/generate';

const mockReplace = jest.fn();
const mockRpc = jest.fn(async (..._args: unknown[]) => ({ error: null }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ week: '2026-11-02', from: 'plan' }),
}));
jest.mock('../../providers/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'u' } } }) }));
jest.mock('../../providers/ProfileProvider', () => ({ useProfile: () => ({ profile: { units: 'metric' } }) }));
jest.mock('../config', () => ({ config: { groceryOrdering: true } }));
jest.mock('../supabase', () => {
  const entries = { data: [{ recipe_id: 'r1', servings: 2 }], error: null };
  const recipes = { data: [{ id: 'r1', title: 'Chili', servings: 2, recipe_ingredients: [
    { name: 'Beans', quantity: 400, unit: 'g', section: 'pantry', position: 0 },
    { name: 'Onion', quantity: 1, unit: null, section: 'produce', position: 1 },
  ] }], error: null };
  return { supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => ({ select: () => table === 'pantry_items' ? Promise.resolve({ data: [], error: null })
      : table === 'recipes' ? { in: async () => recipes }
        : { in: () => ({ in: () => ({ is: async () => entries }) }) } }),
  } };
});
jest.mock('../../components/ui', () => {
  const React = require('react');
  const { Text, Pressable, View } = require('react-native');
  const box = ({ children }: { children: unknown }) => React.createElement(View, null, children);
  const text = ({ children }: { children: unknown }) => React.createElement(Text, null, children);
  const press = ({ title, label, onPress }: { title?: string; label?: string; onPress: () => void }) =>
    React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: title ?? label, onPress }, React.createElement(Text, null, title ?? label));
  return { Screen: box, Card: box, ChipRow: box, Disclosure: box, Body: text, Notice: text, Empty: () => null, Loading: () => null, Button: press, Chip: press };
});

test('adding a planned week returns to Groceries with the added count for one-tap ordering', async () => {
  await render(<GenerateGrocery />);
  expect(await screen.findByText('Next: order them on Instacart in one tap.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Add 2 items to grocery list' }));
  expect(mockRpc).toHaveBeenCalledWith('replace_generated_groceries', expect.objectContaining({ p_week: '2026-11-02', p_expected_user_id: 'u' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/grocery', params: { added: '2' } });
});
