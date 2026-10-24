import type { ActivityLevel, DietPref, Goal, Sex, Units } from '../../types';

export interface OnboardingAnswers {
  step: number; goal: Goal | null; sex: Sex | null; birthYear: string; birthMonth: string;
  birthDay: string; units: Units; cm: string; ft: string; inches: string; weight: string;
  activity: ActivityLevel | null; diets: DietPref[];
}
export const onboardingDraftKey = (userId: string) => `buko:onboarding:${userId}`;
export function parseOnboardingDraft(raw: string, now = Date.now()): OnboardingAnswers | null {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('savedAt' in value) || typeof value.savedAt !== 'number'
    || !('answers' in value) || !value.answers || typeof value.answers !== 'object') throw new Error('Saved setup progress could not be read. Start again or clear it.');
  if (now - value.savedAt > 7 * 86400000 || value.savedAt > now + 60000) return null;
  const a = value.answers;
  if (!('step' in a) || typeof a.step !== 'number' || !Number.isInteger(a.step) || a.step < 0 || a.step > 5
    || !('goal' in a) || ![null, 'lose', 'maintain', 'gain'].includes(a.goal as Goal | null)
    || !('sex' in a) || ![null, 'male', 'female', 'unspecified'].includes(a.sex as Sex | null)
    || !('units' in a) || !['metric', 'imperial'].includes(String(a.units))
    || !('activity' in a) || ![null, 'sedentary', 'light', 'moderate', 'active', 'very_active'].includes(a.activity as ActivityLevel | null)
    || !('diets' in a) || !Array.isArray(a.diets) || a.diets.some((d) => !['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'].includes(d))
    || !['birthYear', 'birthMonth', 'birthDay', 'cm', 'ft', 'inches', 'weight'].every((key) => key in a && typeof Reflect.get(a, key) === 'string' && Reflect.get(a, key).length <= 20)) {
    throw new Error('Saved setup progress is invalid. Clear it and start again.');
  }
  return a as OnboardingAnswers;
}
