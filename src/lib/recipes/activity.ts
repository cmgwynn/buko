export interface RecipeActivityStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface RecentlyCookedRecipe {
  recipeId: string;
  cookedAt: string;
}

const RECENT_LIMIT = 30;

export const recipeFavoritesKey = (userId: string) => `buko:recipe-favorites:${userId}`;
export const recentlyCookedKey = (userId: string) => `buko:recently-cooked:${userId}`;

function validateUserId(userId: string): void {
  if (!userId.trim()) throw new Error('A signed-in account is required to save recipe activity.');
}

async function readStringList(storage: RecipeActivityStorage, key: string): Promise<string[]> {
  const value = await storage.getItem(key);
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item)) {
      throw new Error('Stored recipe activity has an unexpected format.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Stored recipe activity could not be read.');
    throw error;
  }
}

async function readCookedList(storage: RecipeActivityStorage, key: string): Promise<RecentlyCookedRecipe[]> {
  const value = await storage.getItem(key);
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) =>
      !item || typeof item.recipeId !== 'string' || !item.recipeId ||
      typeof item.cookedAt !== 'string' || Number.isNaN(Date.parse(item.cookedAt)))) {
      throw new Error('Stored cooking history has an unexpected format.');
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Stored cooking history could not be read.');
    throw error;
  }
}

/** Runs an account-owned write; resolves false when that account is no longer active. */
export type AccountWriteRunner = (userId: string, write: () => Promise<void>) => Promise<boolean>;

const runDirectly: AccountWriteRunner = async (_userId, write) => { await write(); return true; };
const STALE_ACCOUNT = 'Your account changed or signed out, so this recipe activity was not saved.';

export function createRecipeActivityStore(storage: RecipeActivityStorage, runWrite: AccountWriteRunner = runDirectly) {
  return {
    async getFavorites(userId: string): Promise<string[]> {
      validateUserId(userId);
      return readStringList(storage, recipeFavoritesKey(userId));
    },
    async setFavorite(userId: string, recipeId: string, favorite: boolean): Promise<string[]> {
      validateUserId(userId);
      if (!recipeId.trim()) throw new Error('A recipe is required to update favorites.');
      const key = recipeFavoritesKey(userId);
      let next: string[] = [];
      const written = await runWrite(userId, async () => {
        const current = await readStringList(storage, key);
        next = favorite
          ? [...new Set([...current, recipeId])]
          : current.filter((id) => id !== recipeId);
        await storage.setItem(key, JSON.stringify(next));
      });
      if (!written) throw new Error(STALE_ACCOUNT);
      return next;
    },
    async getRecentlyCooked(userId: string): Promise<RecentlyCookedRecipe[]> {
      validateUserId(userId);
      return readCookedList(storage, recentlyCookedKey(userId));
    },
    async recordCooked(userId: string, recipeId: string, cookedAt = new Date().toISOString()): Promise<RecentlyCookedRecipe[]> {
      validateUserId(userId);
      if (!recipeId.trim()) throw new Error('A recipe is required to update cooking history.');
      if (Number.isNaN(Date.parse(cookedAt))) throw new Error('A valid cooking date is required.');
      const key = recentlyCookedKey(userId);
      let next: RecentlyCookedRecipe[] = [];
      const written = await runWrite(userId, async () => {
        const current = await readCookedList(storage, key);
        next = [{ recipeId, cookedAt }, ...current.filter((item) => item.recipeId !== recipeId)].slice(0, RECENT_LIMIT);
        await storage.setItem(key, JSON.stringify(next));
      });
      if (!written) throw new Error(STALE_ACCOUNT);
      return next;
    },
  };
}
