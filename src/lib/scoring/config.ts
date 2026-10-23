import type { NutriGrade } from '../../types/index.ts';

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Scoring configuration — the ONE place to tune the Buko health score.
 *
 * Each factor produces a sub-score from 0 (worst) to 100 (best). The final score is
 * the weighted average of the factors we have data for:
 *
 *     score = Σ(weight × subScore) / Σ(weight of known factors)
 *
 * so a product missing one input is not punished for it; its weight is redistributed.
 * If the known weights add up to less than MIN_KNOWN_WEIGHT we refuse to score.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface Source {
  name: string;
  url: string;
}

/** Relative importance of each factor (they need not sum to 100, but do by convention). */
export const WEIGHTS = {
  /** Nutri-Score is a validated composite of energy, sugar, sat. fat, salt, fibre, protein, fruit/veg. Largest weight. */
  nutriscore: 40,
  /** NOVA captures ultra-processing, which nutrient profiles miss. */
  nova: 20,
  /** Additives: fewer is better; certain flagged additives are penalised harder. */
  additives: 15,
  /** Sugar, sodium, sat. fat are already inside Nutri-Score; they are shown separately so the user sees WHY, and they carry smaller extra weight. */
  sugar: 10,
  sodium: 10,
  saturatedFat: 5,
} as const;

export type FactorId = keyof typeof WEIGHTS;

/** Below this total known weight, we show "not enough data" rather than a number. */
export const MIN_KNOWN_WEIGHT = 40;

/** Nutri-Score letter → sub-score. Even steps across the five grades. */
export const NUTRISCORE_POINTS: Record<NutriGrade, number> = { a: 100, b: 75, c: 50, d: 25, e: 0 };

/** NOVA group → sub-score. Group 4 (ultra-processed) scores zero. */
export const NOVA_POINTS: Record<1 | 2 | 3 | 4, number> = { 1: 100, 2: 80, 3: 50, 4: 0 };

/** Additives: start at 100, subtract per additive. */
export const ADDITIVE_PENALTY_EACH = 10;
export const ADDITIVE_PENALTY_FLAGGED = 40;

/**
 * Additives with a documented regulatory or scientific concern. Codes are E-numbers (lowercase).
 * Keep this list short and sourced; every entry must be defensible to a user.
 */
export const FLAGGED_ADDITIVES: Record<string, { reason: string; source: Source }> = {
  e171: {
    reason: 'Titanium dioxide: EFSA could not rule out genotoxicity, and it is no longer authorised in EU food.',
    source: { name: 'EFSA (2021) re-evaluation of E 171', url: 'https://www.efsa.europa.eu/en/efsajournal/pub/6585' },
  },
  ...Object.fromEntries(
    ['e102', 'e104', 'e110', 'e122', 'e124', 'e129'].map((code) => [
      code,
      {
        reason:
          'One of six colours linked to hyperactivity in some children; EU law requires a warning label on foods containing it.',
        source: {
          name: 'EU Regulation (EC) 1333/2008, Annex V',
          url: 'https://eur-lex.europa.eu/eli/reg/2008/1333/oj',
        },
      },
    ]),
  ),
  ...Object.fromEntries(
    ['e249', 'e250', 'e251', 'e252'].map((code) => [
      code,
      {
        reason: 'Nitrites/nitrates used in cured meats; EFSA lowered the acceptable intake and linked them to nitrosamine formation.',
        source: {
          name: 'EFSA (2017) re-evaluation of nitrites and nitrates',
          url: 'https://www.efsa.europa.eu/en/efsajournal/pub/4786',
        },
      },
    ]),
  ),
};

/**
 * Linear thresholds per 100 g (or 100 ml): at or below `best` → 100, at or above `worst` → 0.
 * Ranges are taken from the Nutri-Score 2023 nutrient point scales so Buko agrees with it at the extremes.
 */
export const THRESHOLDS = {
  /** Sugars (g). Nutri-Score scale starts at 4.5 g and tops out at 45 g; we cap at 25 g. WHO advises <10% of energy from free sugars. */
  sugar: { best: 4.5, worst: 25 },
  /** Sodium (mg). Nutri-Score scale tops out at 900 mg. WHO advises <2,000 mg sodium/day. */
  sodium: { best: 90, worst: 900 },
  /** Saturated fat (g). Nutri-Score scale 1–10 g. WHO advises <10% of energy. */
  saturatedFat: { best: 1, worst: 10 },
} as const;

/** Total score → rating band. `min` is inclusive. Highest first. */
export const RATING_BANDS = [
  { min: 75, key: 'excellent', label: 'Excellent' },
  { min: 50, key: 'good', label: 'Good' },
  { min: 25, key: 'mediocre', label: 'Mediocre' },
  { min: 0, key: 'poor', label: 'Poor' },
] as const;

export type RatingKey = (typeof RATING_BANDS)[number]['key'];

/** Products scoring below this get "better alternatives" suggestions. */
export const ALTERNATIVES_BELOW = 50;

/** An alternative must beat the scanned product by at least this many points. */
export const ALTERNATIVE_MIN_IMPROVEMENT = 10;

export const SOURCES = {
  nutriscore: {
    name: 'Nutri-Score (Santé publique France)',
    url: 'https://www.santepubliquefrance.fr/en/nutri-score',
  },
  nova: {
    name: 'NOVA classification (Monteiro et al., 2019, Public Health Nutrition)',
    url: 'https://doi.org/10.1017/S1368980018003762',
  },
  additives: {
    name: 'Open Food Facts additives + EFSA/EU flags',
    url: 'https://world.openfoodfacts.org/additives',
  },
  sugar: {
    name: 'WHO guideline: sugars intake for adults and children (2015)',
    url: 'https://www.who.int/publications/i/item/9789241549028',
  },
  sodium: {
    name: 'WHO guideline: sodium intake for adults and children (2012)',
    url: 'https://www.who.int/publications/i/item/9789241504836',
  },
  saturatedFat: {
    name: 'WHO guideline: saturated fatty acid and trans-fatty acid intake (2023)',
    url: 'https://www.who.int/news/item/17-07-2023-who-updates-guidelines-on-fats-and-carbohydrates',
  },
} as const satisfies Record<FactorId, Source>;
