import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../config';
import { getSession } from '../fitness/session';
import { getDraft } from '../recipes/draft';
import { purgeAccountWork } from '../recovery';
import { supabase } from '../supabase';
import { cleanupDeletedAccount } from './cleanup';
import { removeAccountExportCache } from './download';

export class AccountClientError extends Error {
  constructor(message: string, public code = 'ACCOUNT_ERROR') { super(message); }
}
export async function reauthenticate(password: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user.email) throw new AccountClientError('Sign in again with your account provider to continue.', 'REAUTH_REQUIRED');
  const { data, error } = await supabase.auth.signInWithPassword({ email: session.user.email, password });
  if (error || data.user?.id !== session.user.id) throw new AccountClientError('Password confirmation failed. Check your password and try again.', 'REAUTH_REQUIRED');
}
async function request(action: 'export' | 'delete', expectedUserId: string, confirmation?: string): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AccountClientError('Sign in first.', 'UNAUTHORIZED');
  if (session.user.id !== expectedUserId) throw new AccountClientError('The signed-in account changed. Reopen the account page and try again.');
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/functions/v1/account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, confirmation }), signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new AccountClientError(action === 'delete'
      ? 'Deletion response was not received. The account may already be deleted. Check sign-in; if it still works, retry deletion. No subscription was cancelled.'
      : 'Export could not connect. Check your connection and retry.');
  }
  let result: Record<string, unknown>;
  try { result = await response.json(); }
  catch { throw new AccountClientError('Account service returned an invalid response. Retry or contact the app operator.'); }
  if (!response.ok) throw new AccountClientError(typeof result.error === 'string' ? result.error : 'Account request failed. Please retry.', String(result.code ?? 'ACCOUNT_ERROR'));
  return result;
}
export async function exportAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AccountClientError('Sign in first.', 'UNAUTHORIZED');
  const result = await request('export', session.user.id);
  if (result.format !== 'buko-account-export' || (result.account as { id?: unknown } | undefined)?.id !== session.user.id) {
    throw new AccountClientError('Export identity could not be verified. No file was saved.');
  }
  const current = (await supabase.auth.getSession()).data.session;
  if (current?.user.id !== session.user.id) throw new AccountClientError('The signed-in account changed during export. No file was saved.');
  const diagnosticPreference = await AsyncStorage.getItem(`buko:diagnostics:${session.user.id}`);
  return {
    ...result,
    device: {
      note: 'Unsaved recipe draft and workout from this device only; not stored on the server.',
      recipe_draft: getDraft(), workout_in_progress: getSession(),
      diagnostics_preference: diagnosticPreference,
    },
  };
}
export async function deleteAccount(confirmation: string): Promise<{ cleanupError: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new AccountClientError('Sign in first.', 'UNAUTHORIZED');
  const result = await request('delete', session.user.id, confirmation);
  if (result.deleted !== true) throw new AccountClientError('The server did not confirm deletion. Please retry.');
  let recoveryError: string | null = null;
  try { await purgeAccountWork(session.user.id); }
  catch { recoveryError = 'Your account was deleted, but clearing device recovery failed. Clear this app’s saved data on this device.'; }
  try {
    await cleanupDeletedAccount(session.user.id, {
      currentUserId: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
      removeKeys: async (keys) => {
        await AsyncStorage.multiRemove(keys);
        if (keys.includes(`buko:diagnostics:${session.user.id}`)) await removeAccountExportCache(session.user.id);
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      },
      resetMemory: () => {},
      authStorageKey: `sb-${new URL(config.supabaseUrl).hostname.split('.')[0]}-auth-token`,
    });
    return { cleanupError: recoveryError };
  } catch (error) {
    return { cleanupError: error instanceof Error ? error.message : 'Account deleted. Clear this app’s saved data on this device.' };
  }
}
