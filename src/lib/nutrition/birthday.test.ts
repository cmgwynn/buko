import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Profile } from '../../types';
import { ageOnDate, birthDateFromParts, birthdayTargets, parseBirthDate, profileAge } from './birthday';
import { activityAdjustedTargets } from '../fitness/calc';
import { calculateTargets } from './targets';

const profile: Profile = {
  user_id: 'test-user', goal: 'maintain', sex: 'male', birth_year: 1996, birth_date: '1996-10-23',
  height_cm: 180, weight_kg: 80, activity_level: 'moderate', diet_prefs: [], units: 'metric',
};
const localDate = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

describe('calendar birthdays', () => {
  it('parses only real, unambiguous YYYY-MM-DD calendar dates', () => {
    assert.deepEqual(parseBirthDate('1996-10-23'), { year: 1996, month: 10, day: 23 });
    assert.ok(parseBirthDate('2000-02-29'));
    for (const input of ['', '10/23/1996', '1996-1-2', '2023-02-29', '1900-02-29', '1996-04-31', '1996-00-10', '1996-13-10', '1996-10-00', '1899-12-31', '1996-10-23T00:00:00Z']) {
      assert.equal(parseBirthDate(input), null, input);
    }
  });
  it('constructs dates from numeric form fields without guessing partial/invalid inputs', () => {
    assert.equal(birthDateFromParts('1996', '1', '2'), '1996-01-02');
    assert.equal(birthDateFromParts('1996', '10', '23'), '1996-10-23');
    for (const [year, month, day] of [['96', '1', '2'], ['1996', '', '2'], ['1996', '2', '30'], ['1996', '1x', '2'], ['1996', '1', '2.5'], ['1996', ' 1', '2']]) {
      assert.equal(birthDateFromParts(year, month, day), '');
    }
  });
  it('changes age on the birthday, not January 1, using local dates', () => {
    assert.equal(ageOnDate('1996-10-23', localDate(2026, 10, 22)), 29);
    assert.equal(ageOnDate('1996-10-23', localDate(2026, 10, 23)), 30);
    assert.equal(ageOnDate('1996-10-23', localDate(2026, 10, 24)), 30);
    assert.equal(ageOnDate('1996-10-23', localDate(2027, 1, 1)), 30);
    assert.equal(ageOnDate('1996-01-01', localDate(2027, 1, 1)), 31);
    assert.equal(ageOnDate('1996-12-31', localDate(2026, 12, 30)), 29);
    assert.equal(ageOnDate('1996-12-31', localDate(2026, 12, 31)), 30);
  });
  it('uses March 1 for leap-day birthdays in non-leap years and Feb 29 in leap years', () => {
    assert.equal(ageOnDate('2004-02-29', localDate(2026, 2, 28)), 21);
    assert.equal(ageOnDate('2004-02-29', localDate(2026, 3, 1)), 22);
    assert.equal(ageOnDate('2004-02-29', localDate(2028, 2, 28)), 23);
    assert.equal(ageOnDate('2004-02-29', localDate(2028, 2, 29)), 24);
  });
  it('rejects invalid/future birthdays and invalid reference dates', () => {
    assert.equal(ageOnDate('2027-01-01', localDate(2026, 10, 23)), null);
    assert.equal(ageOnDate('2026-10-24', localDate(2026, 10, 23)), null);
    assert.equal(ageOnDate('not a date', localDate(2026, 10, 23)), null);
    assert.equal(ageOnDate('1996-10-23', new Date(NaN)), null);
  });
  it('preserves approximate legacy birth years without inventing a birthday', () => {
    const legacy = { ...profile, birth_date: null };
    assert.equal(profileAge(legacy, localDate(2026, 1, 1)), 30);
    assert.equal(profileAge({ ...legacy, birth_date: undefined }, localDate(2026, 12, 31)), 30);
    assert.equal(profileAge(profile, localDate(2026, 1, 1)), 29);
    assert.equal(legacy.birth_date, null);
  });
});

describe('birthday-driven nutrition automation', () => {
  it('updates formula targets on the birthday without mutating the profile', () => {
    const before = birthdayTargets(profile, localDate(2026, 10, 22));
    const birthday = birthdayTargets(profile, localDate(2026, 10, 23));
    const expected = calculateTargets({ goal: profile.goal, sex: profile.sex, age: 30, heightCm: 180, weightKg: 80, activityLevel: 'moderate' });
    assert.equal(before.bmr - birthday.bmr, 5);
    assert.equal(birthday.calories, expected.calories);
    assert.equal(birthday.protein_g, expected.proteinG);
    assert.equal(birthday.carbs_g, expected.carbsG);
    assert.equal(birthday.fat_g, expected.fatG);
    assert.equal(birthday.user_id, profile.user_id);
    assert.equal(profile.birth_date, '1996-10-23');
    assert.deepEqual(birthdayTargets(profile, localDate(2026, 10, 24)), birthday);
  });
  it('uses the same age while preserving the activity-adjusted sedentary-baseline behavior', () => {
    const today = localDate(2026, 10, 22);
    const age = profileAge(profile, today);
    assert.ok(age !== null);
    const adjusted = activityAdjustedTargets({
      goal: profile.goal, sex: profile.sex, age, heightCm: profile.height_cm,
      weightKg: profile.weight_kg, activityLevel: profile.activity_level,
    }, 0, 0.5);
    const base = birthdayTargets({ ...profile, activity_level: 'sedentary' }, today);
    assert.equal(base.calories, adjusted.calories);
    assert.equal(base.protein_g, adjusted.protein_g);
    assert.equal(base.carbs_g, adjusted.carbs_g);
    assert.equal(base.fat_g, adjusted.fat_g);
  });
  it('honors preferences and safety floors, rejecting minors instead of calculating adult targets', () => {
    const low = birthdayTargets({ ...profile, sex: 'female', goal: 'lose', weight_kg: 45, height_cm: 150, activity_level: 'sedentary' }, localDate(2026, 10, 23));
    assert.equal(low.calories, 1200);
    assert.equal(low.floor_applied, true);
    assert.throws(() => birthdayTargets({ ...profile, birth_year: 2008, birth_date: '2008-10-24' }, localDate(2026, 10, 23)), /adults only/);
    assert.doesNotThrow(() => birthdayTargets({ ...profile, birth_year: 2008, birth_date: '2008-10-23' }, localDate(2026, 10, 23)));
    assert.throws(() => birthdayTargets({ ...profile, birth_date: 'bad' }, localDate(2026, 10, 23)), /update your birthday/);
  });
});
