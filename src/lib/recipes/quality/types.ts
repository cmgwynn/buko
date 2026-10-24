import type { IngredientDraft, StepDraft } from '../types.ts';

export const RECIPE_QUALITY_CONSENT_VERSION = 'recipe-quality-v1';

export interface QualityRecipe {
  title: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  cuisine: string;
  mealTypes: string[];
  dietTags: string[];
  ingredients: IngredientDraft[];
  steps: StepDraft[];
}

export interface BaseVersion {
  id: string;
  base_recipe_id: string;
  version: number;
  status: string;
  recipe: QualityRecipe;
  adaptation_policy: {
    allowedProteinSwaps: string[];
    allowedDietarySwaps: string[];
    maxSubstitutions: number;
  };
  source_notes: string;
}

export interface RecipeConstraints {
  dietTags: string[];
  excludedIngredients: string[];
  cuisine?: string;
  mealType?: string;
  maxMinutes?: number;
  targetCalories?: number;
  targetProtein?: number;
  preferredCuisines?: string[];
  spiceTolerance?: 'mild' | 'medium' | 'hot';
  dislikedIngredients?: string[];
  maxCookMinutes?: number | null;
  weeknight?: boolean;
  learnedTaste?: {
    spiceFeedback: { tooHot: number; tooMild: number; justRight: number };
    tagCounts: Record<string, number>;
  };
}

export type IssueCategory = 'balance' | 'aromatics' | 'texture' | 'seasoning' | 'technique' | 'compatibility' | 'practicality' | 'restriction' | 'scope';
export interface QualityIssue { category: IssueCategory; severity: 'warning' | 'blocking'; detail: string }
export interface RecipeChange { path: string; reason: string }
export interface ChefReview {
  decision: 'approve' | 'fix' | 'reject';
  note: string;
  issues: QualityIssue[];
  changes: RecipeChange[];
  corrected_recipe: QualityRecipe | null;
}
export interface QualityReport { valid: boolean; issues: QualityIssue[] }
export interface RecipeAttempt {
  attempt: 1 | 2;
  stage: 'adapt' | 'review';
  outcome: 'accepted' | 'rejected' | 'invalid' | 'unavailable';
  issues: QualityIssue[];
  promptVersion: string;
}
export interface QualityResult {
  baseVersionId: string;
  recipe: QualityRecipe;
  disposition: 'tested' | 'adapted' | 'fallback';
  attempts: RecipeAttempt[];
  reviewNote: string;
  changes: RecipeChange[];
  promptVersion: string;
}
export type RecipeModel = (system: string, context: Record<string, unknown>) => Promise<unknown>;
