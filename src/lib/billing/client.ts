import { config } from '../config';
import { supabase } from '../supabase';
import type { BillingStatus } from './core';
export async function billingRequest(operation: 'status' | 'refresh'): Promise<BillingStatus> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error('Please sign in again to verify your subscription.');
  const response = await fetch(`${config.supabaseUrl}/functions/v1/billing`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation }), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : 'Subscription verification is unavailable. Ask the owner to deploy billing and migration 0006.');
  }
  return await response.json() as BillingStatus;
}
export async function checkHealthAccess(): Promise<boolean> {
  if (!config.premiumEnforcement) {
    // Database policy remains authoritative if the server rollout was enabled ahead of this build.
    const { data, error } = await supabase.rpc('has_premium_access');
    if (error && ['PGRST202', '42883'].includes(error.code)) return true;
    if (error) throw new Error('Could not verify health integration access.');
    return data === true;
  }
  return (await billingRequest('refresh')).premium;
}
