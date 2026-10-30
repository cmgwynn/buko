/** Ads may appear only on browse screens, never while logging food, scanning, cooking or training. */
export const AD_PLACEMENTS = ['recipes-browse', 'progress'] as const;
export type AdPlacement = typeof AD_PLACEMENTS[number];
export type AdMode = 'none' | 'house';

export function adMode(input: { enabled: boolean; plus: boolean; placement: string; workoutActive: boolean }): AdMode {
  if (!input.enabled || input.plus || input.workoutActive) return 'none';
  if (!(AD_PLACEMENTS as readonly string[]).includes(input.placement)) return 'none';
  // Network ads (AdMob, non-personalized) need a native build and owner approval; until then show a Plus promo.
  return 'house';
}
