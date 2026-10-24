export const DIAGNOSTIC_CODES = ['render_failure', 'unhandled_js'] as const;
export type DiagnosticCode = typeof DIAGNOSTIC_CODES[number];
export interface DiagnosticSignal { code: DiagnosticCode; platform: 'ios' | 'android' | 'web'; fatal: boolean }
export function diagnosticSignal(value: unknown): DiagnosticSignal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 3 || !DIAGNOSTIC_CODES.some((code) => code === row.code) ||
    !['ios', 'android', 'web'].includes(String(row.platform)) || typeof row.fatal !== 'boolean') return null;
  return { code: row.code as DiagnosticCode, platform: row.platform as DiagnosticSignal['platform'], fatal: row.fatal };
}
export function crashEvent(signal: DiagnosticSignal, release: string) {
  return {
    platform: 'other', release: `buko@${release}`, level: signal.fatal ? 'fatal' : 'error',
    message: signal.code, tags: { runtime: signal.platform, diagnostic: signal.code },
  };
}
