export interface SwipeEnd {
  translationX: number;
  translationY: number;
}

export const DAY_SWIPE_THRESHOLD = 60;
export const SWIPE_LONG_PRESS_MS = 250;

export function swipeDayDelta(event: SwipeEnd, successful: boolean, interrupted: boolean): -1 | 0 | 1 {
  if (!successful || interrupted) return 0;
  if (Math.abs(event.translationX) <= DAY_SWIPE_THRESHOLD) return 0;
  if (Math.abs(event.translationX) < Math.abs(event.translationY) * 2) return 0;
  return event.translationX > 0 ? -1 : 1;
}
