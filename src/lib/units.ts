import type { Units } from '../types';

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

export const cmToFtIn = (cm: number) => {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), inches: totalIn % 12 };
};
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * CM_PER_IN;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

export function formatHeight(cm: number, units: Units): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { ft, inches } = cmToFtIn(cm);
  return `${ft}′ ${inches}″`;
}

export function formatWeight(kg: number, units: Units): string {
  return units === 'metric' ? `${Math.round(kg * 10) / 10} kg` : `${Math.round(kgToLb(kg))} lb`;
}
