import type { Food } from '../../types';
import { config } from '../config';
import { ApiError, fetchJson } from './http';

const BASE = 'https://api.nal.usda.gov/fdc/v1';

interface UsdaNutrient {
  nutrientNumber?: string;
  value?: number;
}
interface UsdaFood {
  fdcId: number;
  description: string;
  foodCategory?: string;
  foodNutrients?: UsdaNutrient[];
}

/** USDA nutrient numbers (values are per 100 g for Foundation and SR Legacy foods). */
const N = {
  kcal: '208', protein: '203', carbs: '205', fat: '204', sugars: '269', satFat: '606', sodium: '307', fiber: '291',
  calcium: '301', iron: '303', potassium: '306', vitaminC: '401', vitaminD: '328',
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s,(])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function parseUsdaFood(f: UsdaFood): Food {
  const get = (num: string): number | null => {
    const v = f.foodNutrients?.find((x) => x.nutrientNumber === num)?.value;
    return typeof v === 'number' ? v : null;
  };
  return {
    source: 'usda',
    sourceId: String(f.fdcId),
    name: titleCase(f.description),
    brand: null,
    imageUrl: null,
    per100g: {
      calories: get(N.kcal), protein: get(N.protein), carbs: get(N.carbs), fat: get(N.fat),
      sugars: get(N.sugars), saturatedFat: get(N.satFat), sodiumMg: get(N.sodium), fiber: get(N.fiber),
      calciumMg: get(N.calcium), ironMg: get(N.iron), potassiumMg: get(N.potassium),
      vitaminCMg: get(N.vitaminC), vitaminDMcg: get(N.vitaminD),
    },
    servingG: null,
    servingLabel: null,
    category: typeof f.foodCategory === 'string' ? f.foodCategory : null,
  };
}

/** Whole-food search (Foundation + SR Legacy). Branded products come from Open Food Facts instead. */
export async function searchWholeFoods(query: string, limit = 15): Promise<Food[]> {
  if (!config.usdaApiKey) throw new ApiError('Add your USDA API key to .env to search whole foods.');
  const url =
    `${BASE}/foods/search?api_key=${encodeURIComponent(config.usdaApiKey)}&query=${encodeURIComponent(query)}` +
    `&dataType=${encodeURIComponent('Foundation,SR Legacy')}&pageSize=${limit}`;
  const data = await fetchJson<{ foods?: UsdaFood[] }>(url);
  return (data.foods ?? []).map(parseUsdaFood).filter((f) => f.per100g.calories !== null);
}
