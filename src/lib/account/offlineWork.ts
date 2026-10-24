export function requireNoActiveWorkout(userId: string, workout: { ownerId: string | null; active: boolean }): void {
  if (workout.ownerId === userId && workout.active) {
    throw new Error('Finish or explicitly discard your active workout before deleting your account. It is saved only on this device. No account deletion was requested.');
  }
}

export async function requireSyncedWorkouts(
  userId: string,
  pendingCount: (userId: string) => Promise<number>,
  activeWorkout?: () => { ownerId: string | null; active: boolean },
): Promise<void> {
  if (activeWorkout) requireNoActiveWorkout(userId, activeWorkout());
  const pending = await pendingCount(userId);
  if (!Number.isSafeInteger(pending) || pending < 0) throw new Error('Offline workout status could not be verified. No account deletion was requested. Retry before deleting.');
  if (pending > 0) throw new Error(`This device has ${pending} queued workout or fitness preference change${pending === 1 ? '' : 's'}. No account deletion was requested. Export a copy if needed, then sync queued workouts and preferences before deleting.`);
  if (activeWorkout) requireNoActiveWorkout(userId, activeWorkout());
}
