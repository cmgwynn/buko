import type { Product } from '../../types/index.ts';

type Raw = Record<string, unknown>;
const num = (value: unknown): number | null => {
  const number = typeof value === 'string' ? parseFloat(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};
const stripLang = (tag: string) => tag.replace(/^[a-z]{2}:/, '');
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Shared native/web/Edge adapter for public Open Food Facts records. */
export function parseProduct(raw: Raw): Product | null {
  const code = String(raw.code ?? '');
  const name = String(raw.product_name ?? '').trim();
  if (!code || !name) return null;
  const n: Raw = raw.nutriments && typeof raw.nutriments === 'object' ? raw.nutriments as Raw : {};
  const sodiumG = num(n.sodium_100g);
  const saltG = num(n.salt_100g);
  const grade = String(raw.nutriscore_grade ?? '').toLowerCase();
  const nova = num(raw.nova_group);
  return {
    source: 'off', sourceId: code, barcode: code, name,
    brand: String(raw.brands ?? '').split(',')[0].trim() || null,
    imageUrl: typeof raw.image_front_small_url === 'string' ? raw.image_front_small_url : typeof raw.image_url === 'string' ? raw.image_url : null,
    per100g: {
      calories: num(n['energy-kcal_100g']) ?? (num(n.energy_100g) !== null ? num(n.energy_100g)! / 4.184 : null),
      protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g),
      sugars: num(n.sugars_100g), saturatedFat: num(n['saturated-fat_100g']),
      sodiumMg: sodiumG !== null ? sodiumG * 1000 : saltG !== null ? saltG / 2.5 * 1000 : null,
      fiber: num(n.fiber_100g),
    },
    servingG: num(raw.serving_quantity), servingLabel: raw.serving_size ? String(raw.serving_size) : null,
    categoryTags: strings(raw.categories_tags),
    nutriscoreGrade: grade === 'a' || grade === 'b' || grade === 'c' || grade === 'd' || grade === 'e' ? grade : null,
    novaGroup: nova && nova >= 1 && nova <= 4 ? Math.round(nova) as 1 | 2 | 3 | 4 : null,
    additives: strings(raw.additives_tags).map((tag) => ({ code: stripLang(tag), name: stripLang(tag).toUpperCase() })),
    allergens: strings(raw.allergens_tags).map(stripLang), ingredientsAnalysis: strings(raw.ingredients_analysis_tags),
  };
}
