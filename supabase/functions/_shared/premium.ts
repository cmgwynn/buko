export class PremiumError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function requirePremium(url: string, anon: string, token: string): Promise<void> {
  const response = await fetch(`${url}/rest/v1/rpc/has_premium_access`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new PremiumError('Subscription verification is unavailable. Ask the owner to apply migration 0006.', 503);
  }
  if (await response.json() !== true) throw new PremiumError('This feature requires Buko Premium. Restore or refresh your subscription in Settings.', 402);
}
