import type { DietPref } from '../../../src/types/index.ts';
import { parseProduct } from '../../../src/lib/api/productParser.ts';
import { pickAlternatives, scoreProduct } from '../../../src/lib/scoring/index.ts';
import type { Candidate } from '../../../src/lib/coach/types.ts';

async function off(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { 'User-Agent': 'Buko/1.0 (https://github.com/cmgwynn/buko; coach public product lookup)', Accept: 'application/json' }, signal: AbortSignal.timeout(4500) });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error('Public product lookup is temporarily unavailable. Please retry your check-in.');
  return await response.json();
}
export async function productContext(codes: string[], diet: DietPref[]): Promise<{ scores: Map<string, number | null>; candidates: Candidate[] }> {
  const scores = new Map<string, number | null>();
  const candidates: Candidate[] = [];
  for (const code of codes.slice(0, 4)) {
    const raw = await off(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
    const current = raw.product && typeof raw.product === 'object' ? parseProduct({ code, ...raw.product as Record<string, unknown> }) : null;
    if (!current) { scores.set(code, null); continue; }
    const result = scoreProduct(current);
    scores.set(code, result.score);
    // Unknown allergens are not safe: restricted diets get no automatic product swap candidates.
    if (diet.length || result.score === null || result.score >= 60 || !current.categoryTags.length) continue;
    const category = current.categoryTags.at(-1)!;
    const found = await off(`https://world.openfoodfacts.org/api/v2/search?categories_tags=${encodeURIComponent(category)}&page_size=12`);
    const rows = Array.isArray(found.products) ? found.products : [];
    const products = rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const parsed = parseProduct(row as Record<string, unknown>);
      return parsed && /^\d{8,14}$/.test(parsed.barcode) && parsed.barcode !== code ? [parsed] : [];
    });
    const choice = pickAlternatives(result, products, 1)[0];
    if (choice) candidates.push({
      ref: `swap-${candidates.length}`, kind: 'product', title: choice.product.name,
      detail: `Alternative to ${current.name}: current Buko scores ${result.score} → ${choice.result.score}. Check ingredients and allergies; availability is not verified.`,
      payload: { source_id: choice.product.barcode, name: choice.product.name },
    });
  }
  return { scores, candidates };
}
