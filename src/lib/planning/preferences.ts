import { supabase } from '../supabase';
import { normalizeExcludedExercises, normalizeExcludedFoods } from './preferenceValidation';

export { normalizeExcludedExercises, normalizeExcludedFoods } from './preferenceValidation';

export interface PlanningPreferences {
  excludedFoods: string[];
  excludedExercises: string[];
}

export const DEFAULT_PLANNING_PREFERENCES: PlanningPreferences = {
  excludedFoods: [],
  excludedExercises: [],
};

function requireUserId(userId: string): void {
  if (!userId.trim()) throw new Error('Sign in to load or save your planning preferences.');
}

export async function loadPlanningPreferences(userId: string): Promise<PlanningPreferences> {
  requireUserId(userId);
  const { data, error } = await supabase.from('planning_preferences')
    .select('excluded_foods, excluded_exercises')
    .eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not load planning exclusions: ${error.message}`);
  if (!data) return DEFAULT_PLANNING_PREFERENCES;
  if (!Array.isArray(data.excluded_foods) || data.excluded_foods.some((value: unknown) => typeof value !== 'string')
    || !Array.isArray(data.excluded_exercises) || data.excluded_exercises.some((value: unknown) => typeof value !== 'string')) {
    throw new Error('Saved planning exclusions are invalid. Update them before generating a plan.');
  }
  return {
    excludedFoods: normalizeExcludedFoods(data.excluded_foods),
    excludedExercises: normalizeExcludedExercises(data.excluded_exercises),
  };
}

export async function savePlanningPreferences(userId: string, preferences: PlanningPreferences): Promise<PlanningPreferences> {
  requireUserId(userId);
  const validated = {
    excludedFoods: normalizeExcludedFoods(preferences.excludedFoods),
    excludedExercises: normalizeExcludedExercises(preferences.excludedExercises),
  };
  const { error } = await supabase.from('planning_preferences').upsert({
    user_id: userId,
    excluded_foods: validated.excludedFoods,
    excluded_exercises: validated.excludedExercises,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Could not save planning exclusions: ${error.message}`);
  return validated;
}
