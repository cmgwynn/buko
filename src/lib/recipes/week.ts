import { addDays } from '../diary';

/** Monday of the week containing `dateStr` (YYYY-MM-DD). */
export function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

export const weekDays = (start: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** How a day's planned calories compare with the target, for colouring. */
export function dayStatus(plannedKcal: number, targetKcal: number): 'empty' | 'under' | 'on' | 'over' {
  if (plannedKcal <= 0) return 'empty';
  const ratio = plannedKcal / targetKcal;
  if (ratio < 0.9) return 'under';
  if (ratio > 1.1) return 'over';
  return 'on';
}
