export interface BillingStatus {
  enforced: boolean;
  premium: boolean;
  expiresAt: string | null;
  sandbox: boolean;
}
export const ENTITLEMENT = 'premium';
export function verifiedEntitlement(value: unknown, now = Date.now()): { expiresAt: string | null; sandbox: boolean } {
  if (!value || typeof value !== 'object' || !('subscriber' in value)) throw new Error('Invalid billing provider response.');
  const subscriber = value.subscriber;
  if (!subscriber || typeof subscriber !== 'object') throw new Error('Invalid billing provider response.');
  const record = subscriber as Record<string, unknown>;
  const entitlements = record.entitlements;
  if (!entitlements || typeof entitlements !== 'object') throw new Error('Invalid billing provider response.');
  const entitlement = (entitlements as Record<string, unknown>)[ENTITLEMENT];
  if (!entitlement) return { expiresAt: null, sandbox: false };
  if (typeof entitlement !== 'object') throw new Error('Invalid billing entitlement.');
  const item = entitlement as Record<string, unknown>;
  if (typeof item.expires_date !== 'string') return { expiresAt: null, sandbox: false };
  let expiry = Date.parse(item.expires_date);
  if (!Number.isFinite(expiry)) throw new Error('Invalid billing expiration.');
  if (item.grace_period_expires_date != null) {
    const grace = typeof item.grace_period_expires_date === 'string' ? Date.parse(item.grace_period_expires_date) : NaN;
    if (!Number.isFinite(grace)) throw new Error('Invalid billing grace period.');
    expiry = Math.max(expiry, grace);
  }
  if (expiry <= now) return { expiresAt: null, sandbox: false };
  const subscription = record.subscriptions && typeof record.subscriptions === 'object'
    ? (record.subscriptions as Record<string, unknown>)[String(item.product_identifier)] : null;
  if (!subscription || typeof subscription !== 'object' || !('is_sandbox' in subscription) || typeof subscription.is_sandbox !== 'boolean') {
    throw new Error('Subscription environment could not be verified.');
  }
  if ('refunded_at' in subscription && subscription.refunded_at != null) return { expiresAt: null, sandbox: subscription.is_sandbox };
  return { expiresAt: new Date(expiry).toISOString(), sandbox: subscription.is_sandbox };
}
