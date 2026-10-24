import type { Session } from '@supabase/supabase-js';
import { Text } from 'react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthProvider';

const mockGetItem = jest.fn<() => Promise<string | null>>();
const mockGetSession = jest.fn<() => Promise<{ data: { session: Session | null }; error: { name: string; message: string } | null }>>();
const mockRecover = jest.fn(async (_owner: string | null) => {});
let mockEvent: (event: string, next: Session | null) => void = () => {};
const saved: Session = {
  access_token: 'local-test-token', refresh_token: 'local-test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 1,
  user: { id: 'owner', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' },
};
jest.mock('../lib/config', () => ({ config: { supabaseUrl: 'https://example.supabase.co' } }));
jest.mock('../lib/recovery', () => ({ recoverAccountWork: (owner: string | null) => mockRecover(owner) }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: { getItem: () => mockGetItem() },
}));
jest.mock('../lib/supabase', () => ({ supabase: { auth: {
  getSession: () => mockGetSession(),
  onAuthStateChange: (callback: typeof mockEvent) => { mockEvent = callback; return { data: { sub: undefined, subscription: { unsubscribe: jest.fn() } } }; },
  startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
} } }));
function Probe() {
  const value = useAuth();
  return <Text>{`${value.loading ? 'loading' : 'ready'}:${value.session?.user.id ?? 'signed-out'}:${value.sessionError ?? 'no-error'}`}</Text>;
}
beforeEach(() => {
  mockGetSession.mockReset(); mockGetItem.mockReset(); mockRecover.mockClear();
  mockGetSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'offline' } });
  mockGetItem.mockResolvedValue(JSON.stringify(saved));
});
test('retryable offline refresh permits local recovery from the existing saved sign-in', async () => {
  await render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText(/ready:owner:Offline workout access/);
  expect(mockRecover).toHaveBeenCalledWith('owner');
});
test('an explicit sign-out wins over a slow saved-session read', async () => {
  let complete: (value: string | null) => void = () => { throw new Error('Storage read has not started.'); };
  mockGetItem.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(mockGetItem).toHaveBeenCalled());
  await act(async () => { mockEvent('SIGNED_OUT', null); complete(JSON.stringify(saved)); });
  expect(screen.getByText('ready:signed-out:no-error')).toBeTruthy();
  expect(mockRecover).not.toHaveBeenCalledWith('owner');
});
test('invalid saved credentials do not produce success-shaped offline access', async () => {
  mockGetItem.mockResolvedValue('{}');
  await render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText(/ready:signed-out:No saved sign-in is available/);
});
