import type { Product } from '../../types';
import { ALTERNATIVES_BELOW, pickAlternatives, scoreProduct, type ScoreResult } from '../scoring';
import { getCategoryProducts } from './openFoodFacts';

export interface Alternative {
  product: Product;
  result: ScoreResult & { score: number };
}

/** OFF sometimes stores raw names ("en:Rice Noodles"); its search only matches canonical tags ("en:rice-noodles"). */
export function canonicalCategoryTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Most specific first. Taxonomy tags (already canonical, English) are tried before free-text
 * user tags such as "fr:Nuttela", which rarely match other products.
 */
export function alternativeSearchTags(categoryTags: string[], limit = 3): string[] {
  const specificFirst = [...categoryTags].reverse();
  const taxonomy = specificFirst.filter((tag) => tag.startsWith('en:') && tag === canonicalCategoryTag(tag));
  const other = specificFirst.filter((tag) => !taxonomy.includes(tag)).map(canonicalCategoryTag);
  return [...new Set([...taxonomy, ...other])].slice(0, limit);
}

/**
 * Suggest higher-scoring products from the same category. Uses the most specific category
 * first and only falls back to the next one if it has nothing better, because broader
 * categories drift off-topic. Every candidate is scored with the same module as the scanned product.
 */
export async function findAlternatives(product: Product, current: ScoreResult): Promise<Alternative[]> {
  if (current.score === null || current.score >= ALTERNATIVES_BELOW) return [];
  const tags = alternativeSearchTags(product.categoryTags);
  let failure: unknown = null;
  for (const tag of tags) {
    let candidates: Product[];
    try { candidates = (await getCategoryProducts(tag)).filter((c) => c.barcode !== product.barcode); }
    catch (e) { failure = e; continue; }
    const picks = pickAlternatives(current, candidates, 5);
    if (picks.length > 0) return picks;
  }
  // Only report "nothing better" when the search actually ran; otherwise let the screen offer a retry.
  if (failure && tags.length) throw failure;
  return [];
}

export { scoreProduct };
