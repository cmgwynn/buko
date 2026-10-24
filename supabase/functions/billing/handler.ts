import { verifiedEntitlement, type BillingStatus } from '../../../src/lib/billing/core.ts';
import { BodyError, boundedJson } from '../_shared/body.ts';

export interface BillingStore {
  userId: string;
  status(): Promise<BillingStatus>;
  reserve(): Promise<boolean>;
  save(expiresAt: string | null, sandbox: boolean): Promise<void>;
}
export function createBillingHandler(deps: {
  authenticate(token: string): Promise<BillingStore>;
  subscriber(userId: string): Promise<unknown>;
}) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return json({ error: 'Sign in to manage subscriptions.' }, 401);
    try {
      const store = await deps.authenticate(token);
      const body = await boundedJson(req, 1024);
      if (!body || typeof body !== 'object' || !('operation' in body) || !['status', 'refresh'].includes(String(body.operation))) {
        return json({ error: 'Choose status or refresh.' }, 400);
      }
      if (body.operation === 'refresh') {
        if (!await store.reserve()) return json({ error: 'Too many subscription refreshes. Wait a minute.' }, 429);
        const entitlement = verifiedEntitlement(await deps.subscriber(store.userId));
        await store.save(entitlement.expiresAt, entitlement.sandbox);
      }
      return json(await store.status());
    } catch (error) {
      if (error instanceof BillingError) return json({ error: error.message }, error.status);
      if (error instanceof BodyError) return json({ error: error.message }, error.status);
      console.error('Billing request failed.');
      return json({ error: 'Unable to verify subscription. No purchase or access change was confirmed. Please retry.' }, 503);
    }
  };
}
export class BillingError extends Error {
  constructor(message: string, readonly status = 503) { super(message); }
}
