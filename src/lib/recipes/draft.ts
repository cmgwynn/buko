import { useSyncExternalStore } from 'react';
import type { IngredientDraft, Section, StepDraft } from './types';

/** A recipe being created or edited. Lives in memory only until the user saves it. */
export interface RecipeDraft {
  /** Present when editing an existing recipe. */
  id?: string;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  photoPath: string | null;
  /** Local image chosen but not yet uploaded. */
  photoUri: string | null;
  ingredients: IngredientDraft[];
  steps: StepDraft[];
}

export const emptyDraft = (): RecipeDraft => ({
  title: '', servings: 4, prepMinutes: null, cookMinutes: null, sourceUrl: null, sourceName: null,
  photoPath: null, photoUri: null, ingredients: [], steps: [],
});

export const blankIngredient = (position: number, rawText = '', section: Section = 'pantry'): IngredientDraft => ({
  position, raw_text: rawText, quantity: null, unit: null, name: rawText, grams: null,
  food_source: null, food_source_id: null, nutrition: null, section, match_status: 'unmatched',
});

let current: RecipeDraft = emptyDraft();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getDraft = () => current;
export function setDraft(next: RecipeDraft) {
  current = next;
  emit();
}
export function updateDraft(patch: Partial<RecipeDraft> | ((d: RecipeDraft) => Partial<RecipeDraft>)) {
  current = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
  emit();
}

export function useDraft(): RecipeDraft {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
