import assert from 'node:assert/strict';
import { it } from 'node:test';
import { verifiedEntitlement } from './core';
import { BillingError, createBillingHandler, type BillingStore } from '../../../supabase/functions/billing/handler';
const expiration = '2099-01-01T00:00:00Z';
const provider = (sandbox = false) => ({ subscriber: {
  entitlements: { premium: { expires_date: expiration, product_identifier: 'monthly' } },
  subscriptions: { monthly: { is_sandbox: sandbox } },
} });
it('accepts only future provider-confirmed entitlement with a verified subscription environment', () => {
  assert.equal(verifiedEntitlement(provider()).expiresAt, '2099-01-01T00:00:00.000Z');
  assert.equal(verifiedEntitlement(provider(true)).sandbox, true);
  assert.deepEqual(verifiedEntitlement({ subscriber: { entitlements: {} } }), { expiresAt: null, sandbox: false });
  assert.throws(() => verifiedEntitlement({ subscriber: { entitlements: { premium: { expires_date: expiration } } } }), /environment/);
  assert.throws(() => verifiedEntitlement({ premium: true }), /provider/);
  assert.equal(verifiedEntitlement(provider(), Date.parse('2099-01-02')).expiresAt, null);
});
it('preserves store-confirmed grace periods, keeps cancelled subscriptions until expiry, and rejects refunds', () => {
  const data = provider();
  const grace = { subscriber: {
    ...data.subscriber,
    entitlements: { premium: { expires_date: '2020-01-01T00:00:00Z', grace_period_expires_date: expiration, product_identifier: 'monthly' } },
  } };
  assert.equal(verifiedEntitlement(grace).expiresAt, '2099-01-01T00:00:00.000Z');
  const refunded = { subscriber: { ...data.subscriber, subscriptions: { monthly: { is_sandbox: false, refunded_at: '2026-01-01T00:00:00Z' } } } };
  assert.equal(verifiedEntitlement(refunded).expiresAt, null);
  const cancelled = { subscriber: { ...data.subscriber, subscriptions: { monthly: { is_sandbox: false, unsubscribe_detected_at: '2026-01-01T00:00:00Z' } } } };
  assert.ok(verifiedEntitlement(cancelled).expiresAt);
});
it('authenticates, bounds operations, verifies by authenticated account not a supplied user ID, and enforces rate limits', async () => {
  const calls: unknown[] = [];
  let limit = true;
  const store: BillingStore = {
    userId: 'real-user', reserve: async () => limit,
    status: async () => ({ enforced: false, premium: false, expiresAt: null, sandbox: false }),
    save: async (...args) => { calls.push(args); },
  };
  const handle = createBillingHandler({
    authenticate: async (token) => { if (token !== 'valid') throw new BillingError('Sign in', 401); return store; },
    subscriber: async (uid) => { calls.push(uid); return provider(); },
  });
  const req = (body: unknown, token = 'valid') => new Request('https://example.test/billing', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  assert.equal((await handle(req({ operation: 'refresh' }, 'bad'))).status, 401);
  assert.equal((await handle(req({ operation: 'forged' }))).status, 400);
  assert.equal((await handle(req({ operation: 'status' }))).status, 200);
  assert.equal(calls.length, 0);
  assert.equal((await handle(req({ operation: 'refresh', userId: 'forged' }))).status, 200);
  assert.equal(calls[0], 'real-user');
  assert.deepEqual(calls[1], ['2099-01-01T00:00:00.000Z', false]);
  limit = false;
  assert.equal((await handle(req({ operation: 'refresh' }))).status, 429);
  assert.equal(calls.length, 2);
});
