import { BillingError, createBillingHandler } from './handler.ts';
import type { BillingStatus } from '../../../src/lib/billing/core.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (!url || !anon || !service) throw new Error('Missing Supabase billing configuration.');
const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
async function rest<T>(path: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: token === service ? service : anon, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new BillingError('Billing database setup is incomplete. Apply migration 0006 and retry.'); }
  return await response.json() as T;
}
Deno.serve(createBillingHandler({
  async authenticate(token) {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon }, signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new BillingError('Please sign in again.', 401); }
    const user = await response.json();
    if (typeof user.id !== 'string') throw new BillingError('Please sign in again.', 401);
    const userId: string = user.id;
    return {
      userId,
      reserve: () => rest<boolean>('rpc/reserve_billing_refresh', service, { p_user_id: userId }),
      save: async (expiresAt, sandbox) => {
        await rest('subscription_access?on_conflict=user_id', service, { user_id: userId, expires_at: expiresAt, sandbox, verified_at: new Date().toISOString() });
      },
      async status(): Promise<BillingStatus> {
        const [configs, rows] = await Promise.all([
          rest<{ enforce_premium: boolean; allow_sandbox: boolean }[]>('billing_config?select=enforce_premium,allow_sandbox&singleton=eq.true', token),
          rest<{ expires_at: string | null; verified_at: string; sandbox: boolean }[]>(`subscription_access?select=expires_at,verified_at,sandbox&user_id=eq.${userId}`, token),
        ]);
        if (!configs[0]) throw new BillingError('Missing billing rollout configuration.');
        const row = rows[0];
        const premium = Boolean(row?.expires_at && Date.parse(row.expires_at) > Date.now() &&
          Date.parse(row.verified_at) > Date.now() - 15 * 60_000 && (!row.sandbox || configs[0].allow_sandbox));
        return { enforced: configs[0].enforce_premium, premium, expiresAt: row?.expires_at ?? null, sandbox: row?.sandbox ?? false };
      },
    };
  },
  async subscriber(userId) {
    if (!key) throw new BillingError('RevenueCat is not configured yet. No purchase was initiated.');
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new BillingError('RevenueCat could not verify your subscription. Please retry.'); }
    return await response.json();
  },
}));
