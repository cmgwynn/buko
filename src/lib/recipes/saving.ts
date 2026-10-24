import { detectTimerSeconds } from './timers';
import type { RecipeDraft } from './types';

export function recipeSavePayload(draft: RecipeDraft, userId: string) {
  return {
    p_recipe: {
      id: draft.id ?? null,
      expected_user_id: userId,
      title: draft.title.trim(),
      servings: draft.servings,
      prep_minutes: draft.prepMinutes,
      cook_minutes: draft.cookMinutes,
      source_url: draft.sourceUrl,
      source_name: draft.sourceName,
      ...(draft.communityParentId !== undefined ? { community_parent_id: draft.communityParentId } : {}),
    },
    p_ingredients: draft.ingredients.filter((ingredient) => ingredient.raw_text.trim()).map((ingredient) => ({
      raw_text: ingredient.raw_text, quantity: ingredient.quantity, unit: ingredient.unit,
      name: ingredient.name, grams: ingredient.grams, food_source: ingredient.food_source,
      food_source_id: ingredient.food_source_id, nutrition: ingredient.nutrition,
      section: ingredient.section, match_status: ingredient.match_status,
    })),
    p_steps: draft.steps.filter((step) => step.text.trim()).map((step) => ({
      text: step.text.trim(), timer_seconds: step.timer_seconds ?? detectTimerSeconds(step.text),
    })),
  };
}

export class RecipePhotoSaveError extends Error {
  constructor(public recipeId: string, cause: unknown) {
    super(`The recipe was saved, but its photo was not. Retry saving to update this same recipe. ${cause instanceof Error ? cause.message : ''}`.trim());
  }
}

export interface RecipeSaveDependencies {
  save(payload: ReturnType<typeof recipeSavePayload>): Promise<{ id: string | null; error: { code?: string; message: string } | null }>;
  uploadPhoto(userId: string, recipeId: string, uri: string): Promise<string>;
  setPhoto(userId: string, recipeId: string, path: string): Promise<void>;
}

/** Content replacement is one database transaction. Photos are an explicit, retryable second step. */
export async function savePrivateRecipe(deps: RecipeSaveDependencies, userId: string, draft: RecipeDraft): Promise<string> {
  const { id, error } = await deps.save(recipeSavePayload(draft, userId));
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('Recipe saving requires database migration 0010_ux_workflows.sql. Your draft is kept; ask the app operator to apply it and retry.');
    }
    throw new Error(error.message);
  }
  if (!id) throw new Error('The database did not confirm a saved recipe. Your draft is kept.');
  if (draft.photoUri) {
    try {
      const path = await deps.uploadPhoto(userId, id, draft.photoUri);
      await deps.setPhoto(userId, id, path);
    } catch (cause) {
      throw new RecipePhotoSaveError(id, cause);
    }
  }
  return id;
}
