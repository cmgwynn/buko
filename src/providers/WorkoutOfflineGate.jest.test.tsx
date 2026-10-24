import { Text } from 'react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ProfileProvider, useProfile } from './ProfileProvider';

const mockGetItem = jest.fn<(...args: unknown[]) => Promise<string | null>>();
const mockRun = jest.fn(async (_owner: string, write: () => Promise<void>) => { await write(); return true; });
let mockUser = 'owner';
const mockMaybeSingle = jest.fn<() => Promise<{ data: null; error: { message: string } }>>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: { getItem: (...args: unknown[]) => mockGetItem(...args), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('../lib/account/storageWrites', () => ({ accountStorageWrites: { run: (...args: [string, () => Promise<void>]) => mockRun(...args) } }));
jest.mock('./AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('../lib/useLocalDay', () => ({ useLocalDay: () => '2026-10-24' }));
jest.mock('../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: () => mockMaybeSingle() }) }) }) }),
} }));
function Probe() {
  const { profile, loading, connectionError } = useProfile();
  return <Text>{`${loading ? 'loading' : 'ready'}:${profile?.user_id ?? 'no-profile'}:${connectionError ?? 'no-error'}`}</Text>;
}
beforeEach(() => {
  mockUser = 'owner'; mockGetItem.mockReset(); mockMaybeSingle.mockReset();
  mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
});
test('cached own profile keeps the workout gate open when offline', async () => {
  mockGetItem.mockResolvedValue(JSON.stringify({ profile: { user_id: 'owner' }, targets: null }));
  await render(<ProfileProvider><Probe /></ProfileProvider>);
  await waitFor(() => expect(screen.getByText(/ready:owner:Using your saved profile/)).toBeTruthy());
});
test('a missing offline profile is an explicit error, not successful onboarding data', async () => {
  mockGetItem.mockResolvedValue(null);
  await render(<ProfileProvider><Probe /></ProfileProvider>);
  await waitFor(() => expect(screen.getByText(/ready:no-profile:Your profile could not be loaded/)).toBeTruthy());
});
test('a cached profile belonging to another account cannot open the workout gate', async () => {
  mockGetItem.mockResolvedValue(JSON.stringify({ profile: { user_id: 'other' }, targets: null }));
  await render(<ProfileProvider><Probe /></ProfileProvider>);
  await waitFor(() => expect(screen.getByText(/ready:no-profile:Your profile could not be loaded/)).toBeTruthy());
  expect(screen.queryByText(/ready:other/)).toBeNull();
});
