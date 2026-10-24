import { config } from '../config';
import { supabase } from '../supabase';
import type { RecipeFull } from './db';
import { RECIPE_QUALITY_CONSENT_VERSION, type BaseVersion, type QualityRecipe, type RecipeConstraints } from './quality/types';

export const RECIPE_AI_CONSENT_VERSION = RECIPE_QUALITY_CONSENT_VERSION;
export type CuratedRecipe = QualityRecipe;
export interface CuratedVersion extends BaseVersion {
  archived_at?: string | null;
  tests: { rating: number; would_make_again: boolean; actual_minutes: number; notes: string }[];
}
export interface TastePreferences {
  preferredCuisines: string[]; spiceTolerance: 'mild' | 'medium' | 'hot';
  dislikedIngredients: string[]; maxCookMinutes: number | null; aiConsentVersion: string | null;
}
export interface TasteProfile { preferences: TastePreferences; learned: Record<string, unknown> }
export const DEFAULT_TASTE: TastePreferences = {
  preferredCuisines: [], spiceTolerance: 'medium', dislikedIngredients: [], maxCookMinutes: null, aiConsentVersion: null,
};
export interface QualityProvenance { label: 'Tested' | 'Adapted' | null; baseTitle: string | null; note: string | null }
export interface QualityFlag {
  base_recipe_id?: string; version_id?: string; title?: string; disposition?: string;
  distinct_users?: number; thumbs_down_rate?: number;
}
export interface SuggestionRequest {
  requestId: string;
  baseVersionId?: string;
  constraints: RecipeConstraints;
}
function setupMessage(message: string, code?: string): string {
  return ['42883', '42P01', 'PGRST202', 'PGRST205'].includes(code ?? '')
    ? 'Recipe quality setup is not complete. Apply migration 0014 and deploy the recipe-quality function. Existing recipes are unchanged.'
    : message;
}
export function formatTasteLearning(name: string, value: unknown): string | null {
  const label = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  if (typeof value === 'number') return `${label}: ${Math.round(value * 10) / 10}`;
  if (typeof value === 'string') return `${label}: ${value}`;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.length ? `${label}: ${value.join(', ')}` : null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const counts = Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
    return counts.length ? `${label}: ${counts.map(([key, count]) => `${key.replace(/_/g, ' ')} (${count})`).join(', ')}` : null;
  }
  return null;
}
async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(setupMessage(error.message, error.code));
  return data as T;
}
export const isRecipeAdmin = () => rpc<boolean>('recipe_quality_is_admin');
export const loadCuratedVersions = () => rpc<CuratedVersion[]>('recipe_quality_admin_list');
export const loadApprovedRecipes = () => rpc<CuratedVersion[]>('recipe_quality_approved');
export const loadQualityFlags = () => rpc<QualityFlag[]>('recipe_quality_flags');
export async function loadTasteProfile(): Promise<TasteProfile> {
  const result = await rpc<Partial<TasteProfile> | null>('recipe_quality_taste_profile');
  return { preferences: { ...DEFAULT_TASTE, ...result?.preferences }, learned: result?.learned ?? {} };
}
export const saveTasteProfile = (preferences: TastePreferences) => rpc<void>('recipe_quality_save_taste_profile', { p_preferences: preferences });
export const resetTasteLearning = () => rpc<void>('recipe_quality_reset_taste_learning');
export const loadQualityProvenance = (recipeId: string) => rpc<QualityProvenance>('recipe_quality_provenance', { p_recipe_id: recipeId });
export const saveCuratedDraft = (recipe: CuratedRecipe, sourceNotes: string, policy: CuratedVersion['adaptation_policy'], baseId: string | null) =>
  rpc<string>('recipe_quality_create_draft', { p_recipe: recipe, p_base_id: baseId, p_policy: policy, p_source_notes: sourceNotes });
export const recordCuratedTest = (versionId: string, rating: number, makeAgain: boolean, actualMinutes: number, notes: string) =>
  rpc<void>('recipe_quality_record_test', { p_version_id: versionId, p_rating: rating, p_would_make_again: makeAgain, p_actual_minutes: actualMinutes, p_notes: notes });
export const approveCuratedVersion = (versionId: string) => rpc<void>('recipe_quality_approve', { p_version_id: versionId });
export const archiveCuratedBase = (baseId: string, archived: boolean) => rpc<void>('recipe_quality_archive', { p_base_id: baseId, p_archived: archived });
export const FEEDBACK_TAGS = ['too bland', 'too salty', 'too complicated', 'family loved it'] as const;
export interface TasteFeedback {
  recipeId: string; eventId: string; thumb: boolean | null; makeAgain: boolean | null;
  tags: string[]; actualMinutes: number | null; spice: string | null; disliked: string[];
}
export const saveTasteFeedback = (feedback: TasteFeedback) => rpc<void>('recipe_quality_feedback', {
  p_recipe_id: feedback.recipeId, p_event_id: feedback.eventId, p_thumb: feedback.thumb, p_make_again: feedback.makeAgain,
  p_tags: feedback.tags, p_actual_minutes: feedback.actualMinutes, p_spice: feedback.spice, p_disliked: feedback.disliked,
});
export function curatedFromPrivate(full: RecipeFull, cuisine: string, mealTypes: string[], dietTags: string[]): CuratedRecipe {
  if (full.recipe.prep_minutes === null || full.recipe.cook_minutes === null) {
    throw new Error('Set explicit prep and cook minutes before curation. Use 0 for a step that takes no cooking time; unknown time is not treated as zero.');
  }
  return {
    title: full.recipe.title, servings: full.recipe.servings, prepMinutes: full.recipe.prep_minutes, cookMinutes: full.recipe.cook_minutes,
    cuisine, mealTypes, dietTags,
    ingredients: full.ingredients.map(({ id: _id, recipe_id: _recipe, user_id: _owner, ...ingredient }) => ingredient),
    steps: full.steps.map(({ position, text, timer_seconds }) => ({ position, text, timer_seconds })),
  };
}
export async function qualityRequest<T>(body: { operation: 'status' } | (SuggestionRequest & { operation: 'suggest' })): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Sign in to request a tested meal.');
  const response = await fetch(`${config.supabaseUrl}/functions/v1/recipe-quality`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const text = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Recipe suggestion failed. Your saved recipes are unchanged.';
    throw new Error(response.status === 404 ? 'Deploy the recipe-quality Edge Function before requesting a meal.' : text);
  }
  return result as T;
}
export async function loadQualityStatus(): Promise<{ enabled: boolean; consentVersion: string }> {
  const result = await qualityRequest<unknown>({ operation: 'status' });
  if (!result || typeof result !== 'object' || !('enabled' in result) || typeof result.enabled !== 'boolean'
    || !('consentVersion' in result) || typeof result.consentVersion !== 'string') {
    throw new Error('Recipe quality status was invalid. No AI request was started.');
  }
  if (result.consentVersion !== RECIPE_AI_CONSENT_VERSION) throw new Error('Recipe sharing terms changed. Update Buko before enabling AI recipe sharing.');
  return { enabled: result.enabled, consentVersion: result.consentVersion };
}
