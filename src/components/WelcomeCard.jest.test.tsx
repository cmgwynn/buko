import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWelcome, WelcomeCard, welcomeKey } from './WelcomeCard';

const mockPush = jest.fn<(href: unknown) => void>();
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return { __esModule: true, default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => { store.set(k, v); },
    clear: async () => { store.clear(); },
  } };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('./ui', () => {
  const React = require('react');
  const { Text, Pressable, View } = require('react-native');
  const pressable = ({ title, onPress }: { title: string; onPress: () => void }) =>
    React.createElement(Pressable, { accessibilityRole: 'button', onPress }, React.createElement(Text, null, title));
  return {
    Card: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    Eyebrow: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    Button: pressable, NavigationRow: pressable,
  };
});

beforeEach(async () => { mockPush.mockReset(); await AsyncStorage.clear(); });

test('each start option opens its generator and dismisses the welcome', async () => {
  const onDismiss = jest.fn();
  await render(<WelcomeCard onDismiss={onDismiss} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Plan my week' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/plan', params: { generate: '1' } });
  await fireEvent.press(screen.getByRole('button', { name: 'Build my training plan' }));
  expect(mockPush).toHaveBeenLastCalledWith('/workout/plan');
  expect(onDismiss).toHaveBeenCalledTimes(2);
});

test('shows once per account until dismissed', async () => {
  const { result } = await renderHook(() => useWelcome('owner'));
  await waitFor(() => expect(result.current.show).toBe(true));
  await act(async () => result.current.dismiss());
  expect(result.current.show).toBe(false);
  await waitFor(async () => expect(await AsyncStorage.getItem(welcomeKey('owner'))).toBe('true'));
  const again = await renderHook(() => useWelcome('owner'));
  await act(async () => { await Promise.resolve(); });
  expect(again.result.current.show).toBe(false);
});
