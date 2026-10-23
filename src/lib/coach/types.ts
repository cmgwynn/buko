export const COACH_NOTICE = 'General wellness information, not medical advice.';
export const COACH_CONSENT_VERSION = '2026-10-23';
export type CoachFocus = 'balanced' | 'protein' | 'consistency' | 'movement';
export interface CoachPreferences {
  user_id: string;
  consent_version: string | null;
  focus: CoachFocus;
  include_weight: boolean;
}
export interface CoachAction {
  id: string;
  kind: 'recipe' | 'product';
  title: string;
  detail: string;
  applied_at: string | null;
}
export interface CoachReply {
  id: string;
  kind: 'chat' | 'weekly';
  text: string;
  suggestions: string[];
  safety: boolean;
  facts: WeeklyFacts | null;
  actions: CoachAction[];
  cached?: boolean;
}
export interface WeeklyFacts {
  start: string;
  end: string;
  daysWithLogs: number;
  completeDays: number;
  averageLoggedCalories: number | null;
  averageLoggedProtein: number | null;
  averageTargetCalories: number | null;
  targetComparisonDays: number;
  averageCompleteDayDifference: number | null;
  workouts: number;
  workoutMinutes: number;
  weightMeasurements: number;
  weightTrendKg: number | null;
  averageProductScore: number | null;
  scoredProductEntries: number;
  unscoredProductEntries: number;
  limitations: string[];
}
export interface Candidate {
  ref: string;
  kind: 'recipe' | 'product';
  title: string;
  detail: string;
  payload: { recipe_id: string; recipe_updated_at?: string } | { source_id: string; name: string };
  calories?: number;
  protein?: number;
}
