import type { DietPref, Product } from '../types';

const has = (p: Product, tag: string) => p.ingredientsAnalysis.includes(tag);

/**
 * Human-readable conflicts between a product and the user's dietary preferences, based on
 * Open Food Facts' ingredient analysis and allergen tags. Missing data is never treated as safe.
 */
export function dietConflicts(product: Product, prefs: DietPref[]): string[] {
  const out: string[] = [];
  if (prefs.includes('vegan')) {
    if (has(product, 'en:non-vegan')) out.push('Not vegan: contains animal-derived ingredients.');
    else if (has(product, 'en:maybe-vegan')) out.push('May not be vegan: some ingredients are unclear.');
  }
  if (prefs.includes('vegetarian')) {
    if (has(product, 'en:non-vegetarian')) out.push('Not vegetarian: contains meat or fish.');
    else if (has(product, 'en:maybe-vegetarian')) out.push('May not be vegetarian: some ingredients are unclear.');
  }
  if (prefs.includes('gluten_free') && product.allergens.includes('gluten')) out.push('Contains gluten.');
  if (prefs.includes('dairy_free') && product.allergens.includes('milk')) out.push('Contains milk.');
  if (prefs.includes('nut_free') && (product.allergens.includes('nuts') || product.allergens.includes('peanuts'))) {
    out.push('Contains nuts or peanuts.');
  }
  return out;
}
