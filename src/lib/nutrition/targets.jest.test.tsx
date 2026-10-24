import { describe, expect, test } from '@jest/globals';
import { calculateTargets, floorWarning } from './targets';

describe('nutrition targets', () => {
  test('applies the calorie floor and derives macros from the clamped target', () => {
    const result = calculateTargets({
      goal: 'lose',
      sex: 'female',
      age: 18,
      heightCm: 150,
      weightKg: 40,
      activityLevel: 'sedentary',
    });

    expect(result.floorApplied).toBe(true);
    expect(result.rawCalories).toBeLessThan(result.floor);
    expect(result.calories).toBe(1200);
    expect(result.proteinG).toBe(72);
    expect(result.fatG).toBe(33);
    expect(result.carbsG).toBe(154);
    expect(floorWarning(result)).toContain('1,200 kcal');
  });

  test('does not warn when the calculated target is above the floor', () => {
    const result = calculateTargets({
      goal: 'maintain',
      sex: 'female',
      age: 30,
      heightCm: 165,
      weightKg: 65,
      activityLevel: 'moderate',
    });

    expect(result.floorApplied).toBe(false);
    expect(result.calories).toBe(result.rawCalories);
    expect(floorWarning(result)).toBeNull();
  });
});
