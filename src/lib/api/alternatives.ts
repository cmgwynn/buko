import type { Product } from '../../types';
import { ALTERNATIVES_BELOW, pickAlternatives, scoreProduct, type ScoreResult } from '../scoring';
import { getCategoryProducts } from './openFoodFacts';

export interface Alternative {
  product: Product;
  result: ScoreResult & { score: number };
}

/**
 * Suggest higher-scoring products from the same category. Uses the most specific category
 * first and only falls back to the next one if it has nothing better, because broader
 * categories drift off-topic. Every candidate is scored with the same module as the scanned product.
 */
export async function findAlternatives(product: Product, current: ScoreResult): Promise<Alternative[]> {
  if (current.score === null || current.score >= ALTERNATIVES_BELOW) return [];
  const tags = [...product.categoryTags].reverse().slice(0, 2);
  for (const tag of tags) {
    const candidates = (await getCategoryProducts(tag)).filter((c) => c.barcode !== product.barcode);
    const picks = pickAlternatives(current, candidates, 5);
    if (picks.length > 0) return picks;
  }
  return [];
}

export { scoreProduct };
