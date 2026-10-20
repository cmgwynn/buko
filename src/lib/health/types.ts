/**
 * Health data adapter: one interface over Apple HealthKit (iOS) and Google Health Connect (Android).
 *
 * PRIVACY: Data read from or written to HealthKit / Health Connect is used only to show the user their own
 * activity and to adjust their own calorie target. It is never used for advertising and never shared with any
 * third party (an Apple and Google requirement). It is stored only in the user's own Supabase rows, protected
 * by row-level security.
 */

export type HealthFeature = 'read_steps' | 'read_active_energy' | 'read_workouts' | 'write_workouts' | 'write_nutrition';

export type ActivityHint = 'strength' | 'running' | 'walking' | 'cycling' | 'other';

export interface DayActivity {
  steps: number | null;
  activeKcal: number | null;
}

export interface ImportedWorkout {
  externalId: string;
  name: string;
  start: Date;
  end: Date;
  durationMin: number;
  calories: number | null;
}

export interface WorkoutToWrite {
  name: string;
  start: Date;
  end: Date;
  calories: number | null;
  distanceM: number | null;
  hint: ActivityHint;
}

export interface NutritionToWrite {
  name: string;
  at: Date;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface HealthAdapter {
  platform: 'healthkit' | 'health_connect';
  /** True when the native module is present and the device supports it. */
  isAvailable(): Promise<boolean>;
  /** Shows the operating system's permission prompt for just this feature. Returns false when not granted. */
  requestFeature(feature: HealthFeature): Promise<boolean>;
  readDay(day: Date, want: { steps: boolean; activeEnergy: boolean }): Promise<DayActivity>;
  readWorkouts(since: Date): Promise<ImportedWorkout[]>;
  writeWorkout(w: WorkoutToWrite): Promise<string | null>;
  deleteWorkout(externalId: string): Promise<void>;
  writeNutrition(n: NutritionToWrite): Promise<string | null>;
  deleteNutrition(externalId: string): Promise<void>;
}

/** Bundle / package id of this app, used to skip samples Buko wrote itself when importing. */
export const APP_ID = 'com.cmgwynn.buko';
