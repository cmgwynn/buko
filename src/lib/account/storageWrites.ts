/** Serializes device writes and revokes queued work before account cleanup. No native imports. */
export function createAccountStorageWrites() {
  let owner: string | null = null;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    getAccount: () => owner,
    setAccount(next: string | null) {
      if (next !== owner) { owner = next; generation++; }
    },
    async run(userId: string, write: () => Promise<void>): Promise<boolean> {
      const epoch = generation;
      if (owner !== userId) return false;
      const result = queue.then(async () => {
        if (epoch !== generation || owner !== userId) return false;
        await write();
        return true;
      });
      queue = result.catch(() => {});
      return result;
    },
    async revoke(userId: string) {
      if (owner === userId) { owner = null; generation++; }
      await queue;
    },
    async drain() { await queue; },
  };
}

export const accountStorageWrites = createAccountStorageWrites();

export const accountWorkKeys = (userId: string) => [
  `buko:grocery-offline:${userId}`, `buko:onboarding:${userId}`,
];
