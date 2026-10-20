import type { ActivityLevel, Goal, Sex } from '../../types';

/** Minimum daily calories before we warn. Source: common clinical guidance for unsupervised diets. */
export const CALORIE_FLOOR: Record<Sex, number> = {
  female: 1200,
  male: 1500,
  // No sex given: use the higher floor, which is the conservative choice.
  unspecified: 1500,
};

/** Activity multipliers from the Harris-Benedict / Mifflin-St Jeor TDEE convention. */
export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Daily calorie change applied to TDEE: ~0.45 kg (1 lb) per week loss; modest lean gain. */
export const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

/** Protein in grams per kg body weight. */
export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 1.8,
  maintain: 1.6,
  gain: 2.0,
};

/** Fat share of daily calories; carbs fill whatever remains. */
export const FAT_CALORIE_SHARE = 0.25;

export const MIN_AGE = 18;

export interface TargetInput {
  goal: Goal;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
}

export interface TargetResult {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  bmr: number;
  tdee: number;
  /** Calories we would have set without the safety floor. */
  rawCalories: number;
  /** True when the floor raised the target; the UI must show a warning. */
  floorApplied: boolean;
  floor: number;
}

/**
 * Mifflin-St Jeor (1990): BMR = 10*kg + 6.25*cm - 5*age + s
 * s = +5 (male), -161 (female). For "unspecified" we use the midpoint, -78.
 */
export function calculateBmr(sex: Sex, age: number, heightCm: number, weightKg: number): number {
  const offset = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + offset;
}

export function calculateTargets(input: TargetInput): TargetResult {
  const bmr = calculateBmr(input.sex, input.age, input.heightCm, input.weightKg);
  const tdee = bmr * ACTIVITY_MULTIPLIER[input.activityLevel];
  const rawCalories = tdee + GOAL_CALORIE_ADJUSTMENT[input.goal];
  const floor = CALORIE_FLOOR[input.sex];

  // We never silently go below the floor: it is clamped and the UI warns about it.
  const floorApplied = rawCalories < floor;
  const calories = Math.round(Math.max(rawCalories, floor));

  const proteinG = Math.round(PROTEIN_G_PER_KG[input.goal] * input.weightKg);
  const fatG = Math.round((calories * FAT_CALORIE_SHARE) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    rawCalories: Math.round(rawCalories),
    floorApplied,
    floor,
  };
}

export function floorWarning(result: TargetResult): string | null {
  if (!result.floorApplied) return null;
  return (
    `Your calculated target (${result.rawCalories} kcal) is below the ${result.floor.toLocaleString()} kcal ` +
    `minimum we consider safe without medical supervision, so we've set it to ${result.floor.toLocaleString()} kcal. ` +
    `Eating very little can be harmful; please talk to a doctor or dietitian before dieting aggressively.`
  );
}
