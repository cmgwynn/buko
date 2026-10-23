import type { Profile, NutritionTargets } from '../../types';
import { calculateTargets } from './targets';

/** Parse a calendar date without UTC conversion or JavaScript's invalid-date rollover. */
export function parseBirthDate(value: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (year < 1900 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

/** Feb 29 birthdays advance on March 1 in non-leap years. */
export function ageOnDate(birthDate: string, today = new Date()): number | null {
  const birth = parseBirthDate(birthDate);
  if (!birth || !Number.isFinite(today.getTime())) return null;
  const beforeBirthday = today.getMonth() + 1 < birth.month ||
    (today.getMonth() + 1 === birth.month && today.getDate() < birth.day);
  const age = today.getFullYear() - birth.year - Number(beforeBirthday);
  return age < 0 ? null : age;
}

export function birthDateFromParts(year: string, month: string, day: string): string {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return '';
  const value = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return parseBirthDate(value) ? value : '';
}

/** Legacy birth years are approximate; never fabricate a month/day for existing users. */
export function profileAge(profile: Profile, today = new Date()): number | null {
  return profile.birth_date ? ageOnDate(profile.birth_date, today) : today.getFullYear() - profile.birth_year;
}

/** Derived in memory, so birthday updates never overwrite saved targets or food history. */
export function birthdayTargets(profile: Profile, today = new Date()): NutritionTargets {
  const age = profileAge(profile, today);
  if (age === null || age < 18) throw new Error('Please update your birthday in Profile. Buko’s calorie formula is for adults only.');
  const result = calculateTargets({
    goal: profile.goal, sex: profile.sex, age, heightCm: profile.height_cm,
    weightKg: profile.weight_kg, activityLevel: profile.activity_level,
  });
  return {
    user_id: profile.user_id, calories: result.calories, protein_g: result.proteinG,
    carbs_g: result.carbsG, fat_g: result.fatG, bmr: result.bmr, tdee: result.tdee,
    floor_applied: result.floorApplied,
  };
}
