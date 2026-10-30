import type { FoodLogEntry, MicronutrientKey, MicronutrientValues, Nutrients } from '../../types';

export const MICRONUTRIENTS: {
  key: MicronutrientKey;
  label: string;
  unit: 'mg' | 'mcg';
  dailyValue: number;
}[] = [
  { key: 'calciumMg', label: 'Calcium', unit: 'mg', dailyValue: 1300 },
  { key: 'ironMg', label: 'Iron', unit: 'mg', dailyValue: 18 },
  { key: 'potassiumMg', label: 'Potassium', unit: 'mg', dailyValue: 4700 },
  { key: 'vitaminCMg', label: 'Vitamin C', unit: 'mg', dailyValue: 90 },
  { key: 'vitaminDMcg', label: 'Vitamin D', unit: 'mcg', dailyValue: 20 },
];

export const MICRONUTRIENT_KEYS: MicronutrientKey[] = MICRONUTRIENTS.map(({ key }) => key);

export function emptyMicronutrients(): MicronutrientValues {
  return { calciumMg: null, ironMg: null, potassiumMg: null, vitaminCMg: null, vitaminDMcg: null };
}

const isKnown = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function micronutrientsForGrams(per100g: Nutrients, grams: number): MicronutrientValues {
  if (!Number.isFinite(grams) || grams <= 0) return emptyMicronutrients();
  const multiplier = grams / 100;
  return Object.fromEntries(MICRONUTRIENT_KEYS.map((key) => {
    const value = per100g[key];
    return [key, isKnown(value) ? Math.round(value * multiplier * 10) / 10 : null];
  })) as MicronutrientValues;
}

export function per100gMicronutrients(
  amount: MicronutrientValues | null | undefined,
  grams: number,
): Pick<Nutrients, MicronutrientKey> {
  const multiplier = Number.isFinite(grams) && grams > 0 ? 100 / grams : 0;
  return Object.fromEntries(MICRONUTRIENT_KEYS.map((key) => {
    const value = amount?.[key];
    return [key, multiplier > 0 && isKnown(value) ? Math.round(value * multiplier * 10) / 10 : null];
  })) as Pick<Nutrients, MicronutrientKey>;
}

export interface MicronutrientTotal {
  amount: number;
  knownEntries: number;
  missingEntries: number;
}

/** Sums reported amounts while keeping missing source values visible to callers. */
export function sumMicronutrients(entries: Pick<FoodLogEntry, 'micronutrients'>[]): Record<MicronutrientKey, MicronutrientTotal> {
  const totals = Object.fromEntries(MICRONUTRIENT_KEYS.map((key) => [key, {
    amount: 0, knownEntries: 0, missingEntries: 0,
  }])) as Record<MicronutrientKey, MicronutrientTotal>;
  for (const entry of entries) {
    for (const key of MICRONUTRIENT_KEYS) {
      const amount = entry.micronutrients?.[key];
      if (isKnown(amount)) {
        totals[key].amount += amount;
        totals[key].knownEntries++;
      } else {
        totals[key].missingEntries++;
      }
    }
  }
  return totals;
}
