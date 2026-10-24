import type { GroceryItem } from '../../types';

export interface GroceryCache {
  version: 1;
  savedAt: number;
  items: GroceryItem[];
  pending: { id: string; checked: boolean; at: string }[];
}
export interface GroceryStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const groceryCacheKey = (userId: string) => `buko:grocery-offline:${userId}`;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export async function readGroceryCache(storage: GroceryStorage, userId: string, now = Date.now()): Promise<GroceryCache | null> {
  const text = await storage.getItem(groceryCacheKey(userId));
  if (!text) return null;
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('items' in value) || !Array.isArray(value.items)
    || !('pending' in value) || !Array.isArray(value.pending)
    || !('savedAt' in value) || typeof value.savedAt !== 'number') throw new Error('The offline grocery list is invalid. Turn offline access off and on to replace it.');
  if (value.items.some((item) => !item || typeof item.id !== 'string' || item.user_id !== userId || typeof item.name !== 'string' || typeof item.checked !== 'boolean')
    || value.pending.some((item) => !item || typeof item.id !== 'string' || typeof item.checked !== 'boolean' || typeof item.at !== 'string')) {
    throw new Error('The offline grocery list is invalid. Turn offline access off and on to replace it.');
  }
  if (now - value.savedAt > MAX_AGE || value.savedAt > now + 60000) {
    await storage.removeItem(groceryCacheKey(userId));
    if (value.pending.length) throw new Error('An expired offline list was cleared. Some checkmarks were not synced; check your current list.');
    return null;
  }
  return value as GroceryCache;
}

export async function writeGroceryCache(storage: GroceryStorage, userId: string, cache: GroceryCache) {
  if (cache.items.some((item) => item.user_id !== userId)) throw new Error('Cannot save another account’s grocery list.');
  await storage.setItem(groceryCacheKey(userId), JSON.stringify(cache));
}

export function queueGroceryCheck(cache: GroceryCache, id: string, checked: boolean, now = Date.now()): GroceryCache {
  if (!cache.items.some((item) => item.id === id)) throw new Error('This item is no longer in the offline list. Refresh your groceries.');
  const at = new Date(now).toISOString();
  return {
    version: 1, savedAt: now,
    items: cache.items.map((item) => item.id === id ? { ...item, checked, checked_at: checked ? at : null } : item),
    pending: [...cache.pending.filter((item) => item.id !== id), { id, checked, at }],
  };
}
