/** Claims must come from a token already verified by the auth server. Never trust JWT iat as reauthentication. */
export function authenticationTime(claims: Record<string, unknown>, userId: string, lastSignIn: unknown): number {
  if (claims.sub !== userId || typeof lastSignIn !== 'string') return NaN;
  const times: number[] = (Array.isArray(claims.amr) ? claims.amr : [])
    .filter((entry: { method?: string; timestamp?: unknown }) =>
      entry && ['password', 'otp', 'oauth', 'sso/saml', 'totp', 'webauthn'].includes(entry.method ?? '') &&
      typeof entry.timestamp === 'number' && Number.isFinite(entry.timestamp))
    .map((entry: { timestamp: number }) => entry.timestamp);
  return Math.min(Math.max(...times), Date.parse(lastSignIn) / 1000);
}
