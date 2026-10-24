export interface SafeSignOutDependencies {
  currentUserId(): Promise<string | null>;
  purge(userId: string): Promise<void>;
  recover(userId: string | null): Promise<void>;
  signOut(): Promise<void>;
}

/** A failed logout must restore the write guard for whichever account is still signed in. */
export async function signOutWithCleanup(deps: SafeSignOutDependencies): Promise<void> {
  const userId = await deps.currentUserId();
  if (!userId) {
    await deps.recover(null);
    return;
  }
  try {
    await deps.purge(userId);
    if (await deps.currentUserId() !== userId) throw new Error('The signed-in account changed. Nothing from the new account was signed out.');
    await deps.signOut();
    await deps.recover(null);
  } catch (error) {
    let restored = true;
    try { await deps.recover(await deps.currentUserId()); }
    catch { restored = false; }
    throw new Error(`Sign-out was not completed. ${error instanceof Error ? error.message : 'Please retry.'}${restored ? '' : ' Account recovery could not be checked; reopen the app before editing.'}`);
  }
}
