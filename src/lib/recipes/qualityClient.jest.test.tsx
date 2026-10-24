import { beforeEach, expect, jest, test } from '@jest/globals';
import { curatedFromPrivate, DEFAULT_TASTE, loadTasteProfile, saveTasteFeedback, saveTasteProfile } from './qualityClient';
import type { RecipeFull } from './db';

const mockRpc = jest.fn<(name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>>();
jest.mock('../config', () => ({ config: {} }));
jest.mock('../supabase', () => ({ supabase: { rpc: (name: string, params?: Record<string, unknown>) => mockRpc(name, params) } }));
beforeEach(() => { mockRpc.mockReset(); mockRpc.mockResolvedValue({ data: null, error: null }); });
test('an absent taste profile defaults to AI sharing off', async () => {
  expect(await loadTasteProfile()).toEqual({ preferences: DEFAULT_TASTE, learned: {} });
  expect(DEFAULT_TASTE.aiConsentVersion).toBeNull();
});
test('AI consent is saved only as an explicit preference action', async () => {
  await saveTasteProfile({ ...DEFAULT_TASTE, aiConsentVersion: 'recipe-quality-v1' });
  expect(mockRpc).toHaveBeenCalledWith('recipe_quality_save_taste_profile', {
    p_preferences: { ...DEFAULT_TASTE, aiConsentVersion: 'recipe-quality-v1' },
  });
});
test('optional feedback values stay null rather than becoming a negative rating', async () => {
  await saveTasteFeedback({ recipeId: 'recipe', eventId: 'event', thumb: null, makeAgain: true, tags: [], actualMinutes: null, spice: null, disliked: [] });
  expect(mockRpc).toHaveBeenCalledWith('recipe_quality_feedback', expect.objectContaining({ p_thumb: null, p_make_again: true, p_event_id: 'event' }));
});
test('setup errors do not return empty success-shaped recipe results', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'function missing' } });
  await expect(loadTasteProfile()).rejects.toThrow('Apply migration 0014');
});
test('curation strips private ingredient owner/id metadata', () => {
  const full: RecipeFull = {
    recipe: { id: 'private', user_id: 'owner', title: 'Oats', servings: 1, prep_minutes: 2, cook_minutes: 5, source_url: null, source_name: null, photo_path: 'private.jpg', created_at: '', updated_at: '' },
    ingredients: [{ id: 'ingredient', recipe_id: 'private', user_id: 'owner', position: 0, raw_text: '50 g oats', quantity: 50, unit: 'g', name: 'oats', grams: 50, food_source: 'manual', food_source_id: null, nutrition: null, section: 'pantry', match_status: 'unmatched' }],
    steps: [{ id: 'step', recipe_id: 'private', user_id: 'owner', position: 0, text: 'Cook oats.', timer_seconds: 300 }],
  };
  const result = curatedFromPrivate(full, 'Everyday', ['breakfast'], ['vegetarian']);
  expect(result.ingredients[0]).not.toHaveProperty('user_id');
  expect(result).not.toHaveProperty('photo_path');
  expect(result.ingredients[0].grams).toBe(50);
  full.recipe.prep_minutes = null;
  expect(() => curatedFromPrivate(full, 'Everyday', ['breakfast'], ['vegetarian'])).toThrow('Set explicit prep and cook minutes');
});
