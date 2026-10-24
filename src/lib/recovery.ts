import { recipeDraftStore } from './recipes/draft';
import { workoutSessionStore } from './fitness/session';
import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountStorageWrites, accountWorkKeys } from './account/storageWrites';
import { signOutWithCleanup } from './account/signOut';
import { pendingWorkoutCount, purgeFitnessOfflineData } from './fitness/offline';

/** Auth waits for both stores before mounting protected editors. */
export async function recoverAccountWork(userId: string | null) {
  const previous = accountStorageWrites.getAccount();
  accountStorageWrites.setAccount(userId);
  await Promise.all([recipeDraftStore.setAccount(userId), workoutSessionStore.setAccount(userId)]);
  if (previous && previous !== userId) {
    await accountStorageWrites.drain();
    try { await AsyncStorage.multiRemove(accountWorkKeys(previous)); }
    catch {
      recipeDraftStore.reportError('The previous account’s offline groceries or onboarding draft could not be cleared. Retry sign-out or clear this app’s saved data on this device.');
    }
  }
  if (!userId || recipeDraftStore.getAccount() !== userId) return;
  await checkRecoveredRecipe(userId);
}

async function checkRecoveredRecipe(userId: string) {
  const draft = recipeDraftStore.get();
  if (!draft.id) return;
  try {
    const { data, error } = await supabase.from('recipes').select('id').eq('id', draft.id).eq('user_id', userId).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
    if (recipeDraftStore.getAccount() !== userId || recipeDraftStore.get() !== draft) return;
    if (error) throw error;
    if (!data) await recipeDraftStore.clear();
  } catch {
    if (recipeDraftStore.getAccount() === userId) {
      recipeDraftStore.reportError('The saved recipe could not be checked. Reconnect before saving; a deleted recipe cannot be restored.');
    }
  }
}

export async function retryRecipeDraftRecovery() {
  await recipeDraftStore.retry();
  const owner = recipeDraftStore.getAccount();
  if (owner && recipeDraftStore.getRecovery().ready) await checkRecoveredRecipe(owner);
}

export async function purgeAccountWork(userId: string) {
  if (await pendingWorkoutCount(userId) > 0) throw new Error('There are workouts or fitness preferences waiting to sync. Reconnect, open Train and sync them before signing out. Account export can also back up your device-only workout data.');
  if (workoutSessionStore.getAccount() === userId && workoutSessionStore.get().active) throw new Error('Finish or explicitly discard your active workout before signing out. It is saved only on this device.');
  await accountStorageWrites.revoke(userId);
  const results = await Promise.allSettled([
    recipeDraftStore.purge(userId), workoutSessionStore.purge(userId),
    purgeFitnessOfflineData(userId, { discardPending: false }),
    AsyncStorage.multiRemove(accountWorkKeys(userId)),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Device recovery could not be completely cleared. Retry sign-out before leaving, or clear this app’s saved data on this device.');
  }
}

/** Clears queued device work, then signs out locally. Throws a user-visible, retryable error. */
export async function signOutSafely(): Promise<void> {
  await signOutWithCleanup({
    currentUserId: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session?.user.id ?? null;
    },
    purge: purgeAccountWork,
    recover: recoverAccountWork,
    signOut: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
  });
}
