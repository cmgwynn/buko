export interface CleanupDependencies {
  currentUserId(): Promise<string | null>;
  removeKeys(keys: string[]): Promise<void>;
  signOut(): Promise<void>;
  resetMemory(): void;
  authStorageKey: string;
}

/** Never clears global AsyncStorage or another signed-in account's session. */
export async function cleanupDeletedAccount(userId: string, deps: CleanupDependencies): Promise<void> {
  const failures: string[] = [];
  try {
    await deps.removeKeys([
      `buko:diagnostics:${userId}`, recoveryKey('recipe', userId), recoveryKey('workout', userId),
      recipeFavoritesKey(userId), recentlyCookedKey(userId),
      ...accountWorkKeys(userId),
    ]);
  }
  catch { failures.push('device preferences'); }
  if (await deps.currentUserId() === userId) {
    deps.resetMemory();
    try { await deps.signOut(); } catch { failures.push('local sign-out'); }
    const current = await deps.currentUserId();
    if (current === null || current === userId) {
      try {
        await deps.removeKeys([deps.authStorageKey, `${deps.authStorageKey}-code-verifier`, `${deps.authStorageKey}-user`]);
      } catch { failures.push('saved session'); }
    }
  }
  if (failures.length) throw new Error(`Your server account was deleted, but clearing ${failures.join(' and ')} failed. Close the app and clear its saved data on this device. Do not retry server deletion.`);
}
import { recoveryKey } from '../localRecovery';
import { recipeFavoritesKey, recentlyCookedKey } from '../recipes/activity';
import { accountWorkKeys } from './storageWrites';
