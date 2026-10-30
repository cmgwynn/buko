import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createGroceryOrderHandler, MAX_ORDER_ITEMS, toLineItems } from '../../../supabase/functions/grocery-order/handler';

const request = (body: unknown, token = 'user-token') => new Request('https://example.test/grocery-order', {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
});
const base = { enabled: true, apiKey: 'secret', baseUrl: 'https://connect.dev.instacart.tools', authenticate: async () => true };

it('sends only names, quantity notes and valid UPCs', () => {
  assert.deepEqual(toLineItems({ items: [
    { name: '  Greek   yogurt ', quantity: '2 cups', barcode: '012345678905', id: 'secret-id', user_id: 'u' },
    { name: 'Oats', barcode: '1234567890123' },
    { name: 'Yogurt again', barcode: '012345678905' },
  ] }), [
    { name: 'Greek yogurt', display_text: 'Greek yogurt (2 cups)', upcs: ['012345678905'] },
    { name: 'Oats', display_text: 'Oats' },
    { name: 'Yogurt again', display_text: 'Yogurt again' },
  ]);
  assert.throws(() => toLineItems({ items: [] }), /empty/);
  assert.throws(() => toLineItems({ items: Array.from({ length: MAX_ORDER_ITEMS + 1 }, () => ({ name: 'x' })) }), /up to/);
  assert.throws(() => toLineItems({ items: [{ name: '' }] }), /name/);
});

it('stays off until enabled with a key, and requires a signed-in user', async () => {
  let called = false;
  const fetchImpl = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  assert.equal((await createGroceryOrderHandler({ ...base, enabled: false, fetchImpl })(request({ items: [{ name: 'Milk' }] }))).status, 503);
  assert.equal((await createGroceryOrderHandler({ ...base, apiKey: '', fetchImpl })(request({ items: [{ name: 'Milk' }] }))).status, 503);
  assert.equal((await createGroceryOrderHandler({ ...base, fetchImpl })(request({ items: [{ name: 'Milk' }] }, ''))).status, 401);
  assert.equal((await createGroceryOrderHandler({ ...base, authenticate: async () => false, fetchImpl })(request({ items: [{ name: 'Milk' }] }))).status, 401);
  assert.equal(called, false);
});

it('creates an Instacart shopping list and only returns Instacart links', async () => {
  let sent: { url: string; init?: RequestInit } | null = null;
  const ok = createGroceryOrderHandler({ ...base, linkbackUrl: 'https://cmgwynn.github.io/buko/grocery', fetchImpl: (async (url: string, init?: RequestInit) => {
    sent = { url, init };
    return new Response(JSON.stringify({ products_link_url: 'https://customers.dev.instacart.tools/store/shopping_lists/1' }));
  }) as typeof fetch });
  const response = await ok(request({ items: [{ name: 'Milk' }] }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: 'https://customers.dev.instacart.tools/store/shopping_lists/1', count: 1 });
  assert.equal(sent!.url, 'https://connect.dev.instacart.tools/idp/v1/products/products_link');
  assert.equal(new Headers(sent!.init?.headers).get('Authorization'), 'Bearer secret');
  const body = JSON.parse(String(sent!.init?.body));
  assert.equal(body.link_type, 'shopping_list');
  assert.equal(body.landing_page_configuration.partner_linkback_url, 'https://cmgwynn.github.io/buko/grocery');
  const evil = createGroceryOrderHandler({ ...base, fetchImpl: (async () => new Response(JSON.stringify({ products_link_url: 'https://evil.example/x' }))) as typeof fetch });
  assert.equal((await evil(request({ items: [{ name: 'Milk' }] }))).status, 502);
  const down = createGroceryOrderHandler({ ...base, fetchImpl: (async () => new Response('no', { status: 500 })) as typeof fetch });
  assert.equal((await down(request({ items: [{ name: 'Milk' }] }))).status, 502);
});
