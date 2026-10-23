import type { Product } from '../../types/index.ts';
import {
  ADDITIVE_PENALTY_EACH,
  ADDITIVE_PENALTY_FLAGGED,
  FLAGGED_ADDITIVES,
  NOVA_POINTS,
  NUTRISCORE_POINTS,
  SOURCES,
  THRESHOLDS,
  WEIGHTS,
  type FactorId,
  type Source,
} from './config.ts';

/** One explainable line of the score breakdown. */
export interface Factor {
  id: FactorId;
  label: string;
  weight: number;
  /** 0–100 sub-score, or null when the product lacks the data for this factor. */
  points: number | null;
  /** Short value for display, e.g. "Grade C" or "12.5 g / 100 g". */
  value: string;
  /** Plain-English explanation of this product's result. */
  explanation: string;
  source: Source;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 100 at/below `best`, 0 at/above `worst`, linear in between. */
export function linearScore(value: number, best: number, worst: number): number {
  return Math.round(clamp(((worst - value) / (worst - best)) * 100, 0, 100));
}

/** Factor 1: Nutri-Score letter grade (A–E) as published by Open Food Facts. */
export function nutriscoreFactor(p: Product): Factor {
  const base = { id: 'nutriscore', label: 'Nutri-Score', weight: WEIGHTS.nutriscore, source: SOURCES.nutriscore } as const;
  if (!p.nutriscoreGrade) {
    return { ...base, points: null, value: 'Not available', explanation: 'No Nutri-Score is available for this product, so it is left out of the score.' };
  }
  const grade = p.nutriscoreGrade;
  const text: Record<string, string> = {
    a: 'the best grade: a nutritionally favourable profile.',
    b: 'a good grade: generally favourable nutrition.',
    c: 'a middling grade: neither particularly good nor bad.',
    d: 'a poor grade: more sugar, salt or saturated fat (or less fibre/protein) than ideal.',
    e: 'the worst grade: nutritionally unfavourable for regular eating.',
  };
  return { ...base, points: NUTRISCORE_POINTS[grade], value: `Grade ${grade.toUpperCase()}`, explanation: `Nutri-Score ${grade.toUpperCase()} is ${text[grade]}` };
}

/** Factor 2: NOVA processing group (1 = unprocessed … 4 = ultra-processed). */
export function novaFactor(p: Product): Factor {
  const base = { id: 'nova', label: 'Processing (NOVA)', weight: WEIGHTS.nova, source: SOURCES.nova } as const;
  if (!p.novaGroup) {
    return { ...base, points: null, value: 'Not available', explanation: 'The processing level of this product is unknown, so it is left out of the score.' };
  }
  const text = {
    1: 'Unprocessed or minimally processed food.',
    2: 'A processed culinary ingredient (like oil, butter or sugar), normally used in cooking rather than eaten alone.',
    3: 'Processed food: made by adding salt, sugar or oil to whole foods.',
    4: 'Ultra-processed: industrial formulations with ingredients or additives you would not use at home. Diets high in these are linked to poorer health outcomes.',
  } as const;
  return { ...base, points: NOVA_POINTS[p.novaGroup], value: `Group ${p.novaGroup}`, explanation: text[p.novaGroup] };
}

/** Factor 3: number of additives, with extra penalty for ones flagged by EFSA/EU. */
export function additivesFactor(p: Product): Factor {
  const base = { id: 'additives', label: 'Additives', weight: WEIGHTS.additives, source: SOURCES.additives } as const;
  if (p.additivesUnknown) {
    return { ...base, points: null, value: 'Not available', explanation: 'Additives cannot be determined for a home recipe built from generic ingredients, so this factor is left out of the score.' };
  }
  const flagged = p.additives.filter((a) => FLAGGED_ADDITIVES[a.code]);
  const penalty = (p.additives.length - flagged.length) * ADDITIVE_PENALTY_EACH + flagged.length * ADDITIVE_PENALTY_FLAGGED;
  const points = clamp(100 - penalty, 0, 100);
  if (p.additives.length === 0) {
    return { ...base, points: 100, value: 'None', explanation: 'No additives are declared on this product.' };
  }
  const parts = [`${p.additives.length} additive${p.additives.length === 1 ? '' : 's'} declared.`];
  for (const a of flagged) parts.push(`${a.code.toUpperCase()}: ${FLAGGED_ADDITIVES[a.code].reason}`);
  return { ...base, points, value: `${p.additives.length} found`, explanation: parts.join(' ') };
}

function nutrientFactor(
  id: 'sugar' | 'sodium' | 'saturatedFat',
  label: string,
  amount: number | null,
  unit: string,
  describe: (amount: number, points: number) => string,
): Factor {
  const base = { id, label, weight: WEIGHTS[id], source: SOURCES[id] } as const;
  if (amount === null) {
    return { ...base, points: null, value: 'Not available', explanation: `${label} content is not listed, so it is left out of the score.` };
  }
  const t = THRESHOLDS[id];
  const points = linearScore(amount, t.best, t.worst);
  return { ...base, points, value: `${Math.round(amount * 10) / 10} ${unit} / 100 g`, explanation: describe(amount, points) };
}

/** Factor 4: sugars per 100 g. */
export const sugarFactor = (p: Product) =>
  nutrientFactor('sugar', 'Sugar', p.per100g.sugars, 'g', (a, pts) =>
    pts >= 75 ? `Low in sugar (${a.toFixed(1)} g per 100 g).` : pts >= 40 ? `Moderate sugar (${a.toFixed(1)} g per 100 g).` : `High in sugar (${a.toFixed(1)} g per 100 g). The WHO recommends keeping free sugars under 10% of daily energy.`,
  );

/** Factor 5: sodium per 100 g. */
export const sodiumFactor = (p: Product) =>
  nutrientFactor('sodium', 'Sodium', p.per100g.sodiumMg, 'mg', (a, pts) =>
    pts >= 75 ? `Low in sodium (${Math.round(a)} mg per 100 g).` : pts >= 40 ? `Moderate sodium (${Math.round(a)} mg per 100 g).` : `High in sodium (${Math.round(a)} mg per 100 g). The WHO recommends under 2,000 mg of sodium a day.`,
  );

/** Factor 6: saturated fat per 100 g. */
export const saturatedFatFactor = (p: Product) =>
  nutrientFactor('saturatedFat', 'Saturated fat', p.per100g.saturatedFat, 'g', (a, pts) =>
    pts >= 75 ? `Low in saturated fat (${a.toFixed(1)} g per 100 g).` : pts >= 40 ? `Moderate saturated fat (${a.toFixed(1)} g per 100 g).` : `High in saturated fat (${a.toFixed(1)} g per 100 g). The WHO recommends under 10% of daily energy.`,
  );

export function allFactors(p: Product): Factor[] {
  return [nutriscoreFactor(p), novaFactor(p), additivesFactor(p), sugarFactor(p), sodiumFactor(p), saturatedFatFactor(p)];
}
