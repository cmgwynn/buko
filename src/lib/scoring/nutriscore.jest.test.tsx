import { describe, expect, test } from '@jest/globals';
import { gradeForScore } from './nutriscore';

describe('Nutri-Score grade thresholds', () => {
  test.each([
    { score: -1, grade: 'a' },
    { score: 0, grade: 'a' },
    { score: 1, grade: 'b' },
    { score: 2, grade: 'b' },
    { score: 3, grade: 'c' },
    { score: 10, grade: 'c' },
    { score: 11, grade: 'd' },
    { score: 18, grade: 'd' },
    { score: 19, grade: 'e' },
  ])('score $score maps to grade $grade', ({ score, grade }) => {
    expect(gradeForScore(score)).toBe(grade);
  });
});
