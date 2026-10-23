import type { Product } from '../../types';
import { ApiError, fetchJson } from './http';
import { parseProduct } from './productParser';
export { parseProduct } from './productParser';

const BASE = 'https://world.openfoodfacts.org';

const FIELDS = [
  'code', 'product_name', 'brands', 'image_front_small_url', 'image_url', 'categories_tags',
  'nutriscore_grade', 'nova_group', 'additives_tags', 'allergens_tags', 'ingredients_analysis_tags',
  'nutriments', 'serving_quantity', 'serving_size',
].join(',');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const code = barcode.replace(/\D/g, '');
  if (!code) return null;
  try {
    const data = await fetchJson<{ status: number; product?: Raw }>(
      `${BASE}/api/v2/product/${code}.json?fields=${FIELDS}`,
    );
    return data.status === 1 && data.product ? parseProduct({ code, ...data.product }) : null;
  } catch (e) {
    // The API answers unknown barcodes with 404.
    if (e instanceof ApiError && e.message.includes('404')) return null;
    throw e;
  }
}

/** Text search. Open Food Facts rate-limits search (about 10 requests/minute), so only call on submit. */
export async function searchProducts(query: string, limit = 20): Promise<Product[]> {
  const url =
    `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1` +
    `&page_size=${limit}&fields=${FIELDS}`;
  const data = await fetchJson<{ products?: Raw[] }>(url);
  return (data.products ?? []).map(parseProduct).filter((p): p is Product => p !== null);
}

/** Popular products from one category, for alternative suggestions. */
export async function getCategoryProducts(categoryTag: string, limit = 40): Promise<Product[]> {
  const url =
    `${BASE}/api/v2/search?categories_tags=${encodeURIComponent(categoryTag)}` +
    `&sort_by=unique_scans_n&page_size=${limit}&fields=${FIELDS}`;
  const data = await fetchJson<{ products?: Raw[] }>(url);
  return (data.products ?? []).map(parseProduct).filter((p): p is Product => p !== null);
}
