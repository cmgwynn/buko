export type ExerciseCategory = 'strength' | 'cardio';

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves', 'traps', 'full_body', 'cardio',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', abs: 'Abs',
  glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves', traps: 'Traps', full_body: 'Full body', cardio: 'Cardio',
};

export interface Exercise {
  id: string;
  user_id: string | null;
  name: string;
  category: ExerciseCategory;
  muscle_groups: MuscleGroup[];
  equipment: string | null;
  met: number;
}

export interface WorkoutSet {
  id?: string;
  position: number;
  reps: number | null;
  weight_kg: number | null;
  is_warmup: boolean;
  duration_s: number | null;
  distance_m: number | null;
}

export interface Workout {
  id: string;
  name: string;
  started_at: string;
  duration_min: number | null;
  calories_burned: number | null;
  calories_estimated: boolean;
  notes: string | null;
  routine_id: string | null;
  source: 'buko' | 'healthkit' | 'health_connect';
  external_id: string | null;
  exported_external_id: string | null;
}

export type MeasurementKind = 'weight' | 'body_fat' | 'waist' | 'chest' | 'hips' | 'arm' | 'thigh';

export const MEASUREMENT_KINDS: { key: MeasurementKind; label: string; metricUnit: string }[] = [
  { key: 'weight', label: 'Weight', metricUnit: 'kg' },
  { key: 'body_fat', label: 'Body fat', metricUnit: '%' },
  { key: 'waist', label: 'Waist', metricUnit: 'cm' },
  { key: 'chest', label: 'Chest', metricUnit: 'cm' },
  { key: 'hips', label: 'Hips', metricUnit: 'cm' },
  { key: 'arm', label: 'Arm', metricUnit: 'cm' },
  { key: 'thigh', label: 'Thigh', metricUnit: 'cm' },
];

export interface UserSettings {
  user_id: string;
  activity_adjust: boolean;
  activity_share: number;
  health_read_steps: boolean;
  health_read_active_energy: boolean;
  health_read_workouts: boolean;
  health_write_workouts: boolean;
  health_write_nutrition: boolean;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id'> = {
  activity_adjust: false,
  activity_share: 0.5,
  health_read_steps: false,
  health_read_active_energy: false,
  health_read_workouts: false,
  health_write_workouts: false,
  health_write_nutrition: false,
};
