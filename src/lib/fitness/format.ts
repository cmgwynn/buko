import { kgToLb, lbToKg } from '../units';
import type { Units } from '../../types';

/** Weight shown to the user in their units, as a plain number (kg or lb), rounded for display. */
export const toDisplayWeight = (kg: number, units: Units): number => (units === 'metric' ? Math.round(kg * 10) / 10 : Math.round(kgToLb(kg) * 10) / 10);
export const fromDisplayWeight = (v: number, units: Units): number => (units === 'metric' ? v : lbToKg(v));
export const weightUnit = (units: Units) => (units === 'metric' ? 'kg' : 'lb');

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

export const kmFromM = (m: number) => Math.round((m / 1000) * 100) / 100;
export const miFromM = (m: number) => Math.round((m / 1609.344) * 100) / 100;
export const toDisplayDistance = (m: number, units: Units) => (units === 'metric' ? kmFromM(m) : miFromM(m));
export const fromDisplayDistance = (v: number, units: Units) => (units === 'metric' ? v * 1000 : v * 1609.344);
export const distanceUnit = (units: Units) => (units === 'metric' ? 'km' : 'mi');

/** Parse a user-typed decimal ("12", "12.5", "12,5"); null when empty or invalid. */
export function parseNum(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
}
