import type { Product } from '../../types/index.ts';
import { ALTERNATIVE_MIN_IMPROVEMENT, MIN_KNOWN_WEIGHT, RATING_BANDS, type RatingKey } from './config.ts';
import { allFactors, type Factor } from './factors.ts';

export { ALTERNATIVES_BELOW } from './config.ts';
export type { Factor } from './factors.ts';
export type { RatingKey } from './config.ts';

export interface ScoreResult {
  /** 0–100, or null when there is not enough data to score honestly. */
  score: number | null;
  rating: RatingKey | 'unknown';
  ratingLabel: string;
  factors: Factor[];
  /** Share of total factor weight (0–1) backed by real data. */
  confidence: number;
}

export function ratingFor(score: number): { key: RatingKey; label: string } {
  const band = RATING_BANDS.find((b) => score >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1];
  return { key: band.key, label: band.label };
}

/** Weighted average of the factors with data; missing factors' weights are redistributed. */
export function scoreProduct(product: Product): ScoreResult {
  const factors = allFactors(product);
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const known = factors.filter((f) => f.points !== null);
  const knownWeight = known.reduce((s, f) => s + f.weight, 0);

  if (knownWeight < MIN_KNOWN_WEIGHT) {
    return { score: null, rating: 'unknown', ratingLabel: 'Not enough data', factors, confidence: knownWeight / totalWeight };
  }
  const weighted = known.reduce((s, f) => s + f.weight * (f.points as number), 0);
  const score = Math.round(weighted / knownWeight);
  const { key, label } = ratingFor(score);
  return { score, rating: key, ratingLabel: label, factors, confidence: knownWeight / totalWeight };
}

/** Keep only candidates that beat `current` by a meaningful margin, best first. */
export function pickAlternatives(current: ScoreResult, candidates: Product[], limit = 5) {
  if (current.score === null) return [];
  const threshold = current.score + ALTERNATIVE_MIN_IMPROVEMENT;
  return candidates
    .map((product) => ({ product, result: scoreProduct(product) }))
    .filter((c): c is { product: Product; result: ScoreResult & { score: number } } => c.result.score !== null && c.result.score >= threshold)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, limit);
}
