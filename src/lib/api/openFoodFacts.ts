import type { Additive, NutriGrade, Product } from '../../types';
import { ApiError, fetchJson } from './http';

const BASE = 'https://world.openfoodfacts.org';

const FIELDS = [
  'code', 'product_name', 'brands', 'image_front_small_url', 'image_url', 'categories_tags',
  'nutriscore_grade', 'nova_group', 'additives_tags', 'allergens_tags', 'ingredients_analysis_tags',
  'nutriments', 'serving_quantity', 'serving_size',
].join(',');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const stripLang = (tag: string) => tag.replace(/^[a-z]{2}:/, '');

/** Convert an Open Food Facts product record into Buko's Product. Returns null if unusable. */
export function parseProduct(raw: Raw): Product | null {
  const code = String(raw.code ?? '');
  const name = String(raw.product_name ?? '').trim();
  if (!code || !name) return null;

  const n: Raw = raw.nutriments ?? {};
  const sodiumG = num(n.sodium_100g);
  const saltG = num(n.salt_100g);
  const sodiumMg = sodiumG !== null ? sodiumG * 1000 : saltG !== null ? (saltG / 2.5) * 1000 : null;

  const grade = String(raw.nutriscore_grade ?? '').toLowerCase();
  const nova = num(raw.nova_group);
  const additives: Additive[] = ((raw.additives_tags as string[]) ?? []).map((t) => ({
    code: stripLang(t),
    name: stripLang(t).toUpperCase(),
  }));

  return {
    source: 'off',
    sourceId: code,
    barcode: code,
    name,
    brand: String(raw.brands ?? '').split(',')[0].trim() || null,
    imageUrl: raw.image_front_small_url ?? raw.image_url ?? null,
    per100g: {
      calories: num(n['energy-kcal_100g']) ?? (num(n.energy_100g) !== null ? (num(n.energy_100g) as number) / 4.184 : null),
      protein: num(n.proteins_100g),
      carbs: num(n.carbohydrates_100g),
      fat: num(n.fat_100g),
      sugars: num(n.sugars_100g),
      saturatedFat: num(n['saturated-fat_100g']),
      sodiumMg,
      fiber: num(n.fiber_100g),
    },
    servingG: num(raw.serving_quantity),
    servingLabel: raw.serving_size ? String(raw.serving_size) : null,
    categoryTags: (raw.categories_tags as string[]) ?? [],
    nutriscoreGrade: ['a', 'b', 'c', 'd', 'e'].includes(grade) ? (grade as NutriGrade) : null,
    novaGroup: nova && nova >= 1 && nova <= 4 ? (Math.round(nova) as 1 | 2 | 3 | 4) : null,
    additives,
    allergens: ((raw.allergens_tags as string[]) ?? []).map(stripLang),
    ingredientsAnalysis: (raw.ingredients_analysis_tags as string[]) ?? [],
  };
}

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
