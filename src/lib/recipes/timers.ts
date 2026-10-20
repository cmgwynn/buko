/**
 * Finds a cooking duration in a recipe step ("simmer for 10-15 minutes") so cooking mode can offer a timer.
 * Ranges use the upper bound. Returns null when the step has no duration.
 */
export function detectTimerSeconds(text: string): number | null {
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i;
  const m = re.exec(text);
  if (!m) return null;
  const value = Number(m[2] ?? m[1]);
  const unit = m[3].toLowerCase();
  const seconds = unit.startsWith('h') ? value * 3600 : unit.startsWith('m') ? value * 60 : value;
  return seconds > 0 && seconds <= 24 * 3600 ? Math.round(seconds) : null;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
