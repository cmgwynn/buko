import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRecoveryStore, RECIPE_DRAFT_TTL } from '../localRecovery';
import type { IngredientDraft, RecipeDraft, Section } from './types';
export type { RecipeDraft } from './types';

export const emptyDraft = (): RecipeDraft => ({
  title: '', servings: 4, prepMinutes: null, cookMinutes: null, sourceUrl: null, sourceName: null,
  photoPath: null, photoUri: null, ingredients: [], steps: [],
});

export const blankIngredient = (position: number, rawText = '', section: Section = 'pantry'): IngredientDraft => ({
  position, raw_text: rawText, quantity: null, unit: null, name: rawText, grams: null,
  food_source: null, food_source_id: null, nutrition: null, section, match_status: 'unmatched',
});

export const recipeDraftStore = createRecoveryStore<RecipeDraft>({
  kind: 'recipe', ttl: RECIPE_DRAFT_TTL, storage: AsyncStorage, empty: emptyDraft,
  isEmpty: (draft) => !draft.id && !draft.title.trim() && !draft.ingredients.length && !draft.steps.length
    && !draft.photoUri && !draft.photoPath && !draft.sourceUrl && !draft.sourceName
    && draft.servings === 4 && draft.prepMinutes == null && draft.cookMinutes == null,
  validate: (value): value is RecipeDraft => {
    if (!value || typeof value !== 'object') return false;
    const d = value as RecipeDraft;
    return typeof d.title === 'string' && Number.isFinite(d.servings) && d.servings > 0
      && (d.id === undefined || typeof d.id === 'string')
      && Array.isArray(d.ingredients) && d.ingredients.every((i) => i && typeof i.raw_text === 'string'
        && typeof i.name === 'string' && Number.isFinite(i.position)
        && (i.grams === null || Number.isFinite(i.grams))
        && (i.nutrition === null || i.nutrition && typeof i.nutrition.per100g === 'object' && i.nutrition.per100g !== null))
      && Array.isArray(d.steps) && d.steps.every((s) => s && typeof s.text === 'string');
  },
});

export const getDraft = recipeDraftStore.get;
export const clearDraft = recipeDraftStore.clear;
export const prepareDraftSave = recipeDraftStore.prepareToComplete;
export function setDraft(next: RecipeDraft) {
  recipeDraftStore.set(next);
}
export function updateDraft(patch: Partial<RecipeDraft> | ((d: RecipeDraft) => Partial<RecipeDraft>)) {
  const current = getDraft();
  setDraft({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
}

export function useDraft(): RecipeDraft {
  return useSyncExternalStore(recipeDraftStore.subscribe, recipeDraftStore.get);
}

export function useDraftRecovery() {
  return useSyncExternalStore(recipeDraftStore.subscribe, recipeDraftStore.getRecovery);
}
