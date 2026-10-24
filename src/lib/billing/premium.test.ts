import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createImportHandler } from '../../../supabase/functions/import-recipe/handler';
import { PremiumError, requirePremium } from '../../../supabase/functions/_shared/premium';
it('does not fetch a recipe publisher when the server denies Premium', async () => {
  let fetched = false;
  const handler = createImportHandler({
    authenticate: async () => true,
    authorizePremium: async () => { throw new PremiumError('Premium required', 402); },
    fetchPage: async () => { fetched = true; return new Response(''); },
  });
  const response = await handler(new Request('https://example.test/import-recipe', {
    method: 'POST', headers: { Authorization: 'Bearer valid' },
    body: JSON.stringify({ url: 'https://www.simplyrecipes.com/recipe' }),
  }));
  assert.equal(response.status, 402); assert.equal(fetched, false);
});
it('checks database entitlement using the caller token and fails closed on invalid data or missing setup', async () => {
  const fetch = globalThis.fetch;
  let result: unknown = true, status = 200;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://example.test/rest/v1/rpc/has_premium_access');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer authenticated-user');
    assert.equal(new Headers(init?.headers).get('apikey'), 'public-anon');
    return new Response(JSON.stringify(result), { status });
  };
  try {
    await requirePremium('https://example.test', 'public-anon', 'authenticated-user');
    result = { premium: true };
    await assert.rejects(requirePremium('https://example.test', 'public-anon', 'authenticated-user'), (err: unknown) => err instanceof PremiumError && err.status === 402);
    status = 404;
    await assert.rejects(requirePremium('https://example.test', 'public-anon', 'authenticated-user'), (err: unknown) => err instanceof PremiumError && err.status === 503);
  } finally { globalThis.fetch = fetch; }
});
