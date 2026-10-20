import type { NutriGrade, Nutrients } from '../../types';

/**
 * Nutri-Score (2023 algorithm, "general foods" table) computed on-device so that recipes,
 * which have no barcode, can receive the same grade a packaged product would.
 *
 * Source: Nutri-Score 2023 update, Scientific Committee report (Santé publique France).
 * https://www.santepubliquefrance.fr/en/nutri-score
 *
 * Not covered: the separate tables for beverages, fats/oils and cheese, and the red-meat
 * protein cap. Recipes are scored as general foods; this is stated in the app.
 */

/** Count how many thresholds the value strictly exceeds (each one is a point). */
function pointsAbove(value: number, thresholds: number[]): number {
  let pts = 0;
  for (const t of thresholds) if (value > t) pts++;
  return pts;
}

const KJ_PER_KCAL = 4.184;
const ENERGY_KJ = Array.from({ length: 10 }, (_, i) => 335 * (i + 1));
const SUGARS_G = [3.4, 6.8, 10, 14, 17, 20, 24, 27, 31, 34, 37, 41, 44, 48, 51];
const SAT_FAT_G = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SALT_G = Array.from({ length: 20 }, (_, i) => 0.2 * (i + 1));
const PROTEIN_G = [2.4, 4.8, 7.2, 9.6, 12, 14, 17];
const FIBRE_G = [3.0, 4.1, 5.2, 6.3, 7.4];

/** Fruit, vegetables, legumes (and nuts, oils) share of the product, as a percentage. */
function fvlPoints(pct: number): number {
  if (pct > 80) return 5;
  if (pct > 60) return 2;
  if (pct > 40) return 1;
  return 0;
}

export interface NutriScoreResult {
  /** Raw score: negative points minus positive points. Lower is better. */
  score: number;
  grade: NutriGrade;
  negative: number;
  positive: number;
}

export function gradeForScore(score: number): NutriGrade {
  if (score <= 0) return 'a';
  if (score <= 2) return 'b';
  if (score <= 10) return 'c';
  if (score <= 18) return 'd';
  return 'e';
}

/**
 * @param n per-100 g nutrients. Returns null when an input the algorithm requires is missing.
 * @param fvlPercent estimated % of fruit/veg/legumes/nuts by weight (0–100).
 */
export function computeNutriScore(n: Nutrients, fvlPercent: number): NutriScoreResult | null {
  if (n.calories === null || n.sugars === null || n.saturatedFat === null || n.sodiumMg === null || n.protein === null) {
    return null;
  }
  const fibre = n.fiber ?? 0;
  const saltG = (n.sodiumMg * 2.5) / 1000;

  const negative =
    pointsAbove(n.calories * KJ_PER_KCAL, ENERGY_KJ) +
    pointsAbove(n.sugars, SUGARS_G) +
    pointsAbove(n.saturatedFat, SAT_FAT_G) +
    pointsAbove(saltG, SALT_G);

  const fvl = fvlPoints(fvlPercent);
  const fibrePts = pointsAbove(fibre, FIBRE_G);
  // Protein only counts if the food is not high in "bad" points, unless it is mostly fruit/veg.
  const proteinPts = negative >= 11 && fvl < 5 ? 0 : pointsAbove(n.protein, PROTEIN_G);

  const positive = fvl + fibrePts + proteinPts;
  const score = negative - positive;
  return { score, grade: gradeForScore(score), negative, positive };
}
