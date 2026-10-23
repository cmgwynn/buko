import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createImportHandler } from '../../../../supabase/functions/import-recipe/handler';
import { importRecipeFromHtml, importRecipeFromUrl, importRecipeViaBackend, MAX_RECIPE_BYTES } from '../importer';

const url = 'https://www.simplyrecipes.com/recipes/fish_tacos/';
const html = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe', name: 'Test recipe', recipeYield: '2 servings', recipeIngredient: ['1 cup water'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Combine.' }],
})}</script>`;

describe('saved recipe import', () => {
  it('parses local HTML without fetching or executing it and retains attribution', () => {
    const recipe = importRecipeFromHtml(`${html}<script>throw new Error('never execute');</script>`, url);
    assert.equal(recipe.title, 'Test recipe');
    assert.equal(recipe.sourceUrl, url);
    assert.equal(recipe.sourceName, 'simplyrecipes.com');
    assert.deepEqual(recipe.ingredients, ['1 cup water']);
  });
  it('rejects missing structured data, invalid source URLs and oversized UTF-8 pages', () => {
    assert.throws(() => importRecipeFromHtml('Reader text', url), /structured recipe data/);
    assert.throws(() => importRecipeFromHtml(html, 'file:///private/file'), /http and https/);
    assert.throws(() => importRecipeFromHtml('é'.repeat(MAX_RECIPE_BYTES / 2 + 1), url), /too large/);
  });
});

describe('recipe URL import', () => {
  it('preserves native direct import', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(html));
    try {
      assert.equal((await importRecipeFromUrl(url)).sourceUrl, url);
    } finally { fetchMock.mock.restore(); }
  });
  it('calls the authenticated backend and parses its result', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(input, 'https://project.supabase.co/functions/v1/import-recipe');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer session-token');
      assert.equal(new Headers(init?.headers).get('apikey'), 'public-key');
      return Response.json({ html, sourceUrl: url });
    });
    try {
      const result = await importRecipeViaBackend(url, { supabaseUrl: 'https://project.supabase.co', anonKey: 'public-key', accessToken: 'session-token' });
      assert.equal(result.title, 'Test recipe');
    } finally { fetchMock.mock.restore(); }
  });
  for (const [status, body, message] of [
    [404, {}, /not deployed/],
    [422, { error: 'Site blocked (403)' }, /Site blocked/],
    [200, { html: 123 }, /invalid response/],
  ] as const) {
    it(`reports backend failure ${status} explicitly`, async () => {
      const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json(body, { status }));
      try {
        await assert.rejects(importRecipeViaBackend(url, { supabaseUrl: 'https://project.supabase.co', anonKey: 'key', accessToken: 'token' }), message);
      } finally { fetchMock.mock.restore(); }
    });
  }
});

describe('authenticated recipe fetch function', () => {
  const request = (target = url) => new Request('https://project.supabase.co/functions/v1/import-recipe', {
    method: 'POST', headers: { Authorization: 'Bearer test-session' }, body: JSON.stringify({ url: target }),
  });
  it('handles CORS preflight and rejects unauthenticated requests before fetching', async () => {
    const handler = createImportHandler({ authenticate: async () => false, fetchPage: async () => { throw new Error('must not fetch'); } });
    assert.equal((await handler(new Request('https://example.com', { method: 'OPTIONS' }))).status, 204);
    assert.equal((await handler(request())).status, 401);
    assert.equal((await handler(new Request('https://example.com', { method: 'POST' }))).status, 401);
  });
  it('returns bounded HTML with CORS and does not forward account credentials to the recipe site', async () => {
    const handler = createImportHandler({
      authenticate: async (token) => token === 'test-session',
      fetchPage: async (_url, init) => {
        assert.equal(new Headers(init?.headers).get('Authorization'), null);
        assert.equal(new Headers(init?.headers).get('apikey'), null);
        assert.equal(init?.redirect, 'manual');
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      },
    });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(await response.json(), { html, sourceUrl: url });
  });
  for (const target of ['http://www.simplyrecipes.com/a', 'https://localhost/a', 'https://127.0.0.1/', 'https://www.simplyrecipes.com.evil.test/', 'https://user:pass@www.simplyrecipes.com/', 'https://www.simplyrecipes.com:8443/']) {
    it(`rejects disallowed destination ${target}`, async () => {
      const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => { throw new Error('must not fetch'); } });
      assert.equal((await handler(request(target))).status, 400);
    });
  }
  it('revalidates redirects and never fetches an internal destination', async () => {
    let calls = 0;
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => {
      calls++;
      return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/' } });
    } });
    assert.equal((await handler(request())).status, 400);
    assert.equal(calls, 1);
  });
  it('reports site blocks with a saved-page fallback', async () => {
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => new Response('Blocked', { status: 403 }) });
    const response = await handler(request());
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /403.*saved HTML/);
  });
  it('bounds streamed responses even without content-length', async () => {
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => new Response('x'.repeat(MAX_RECIPE_BYTES + 1), { headers: { 'Content-Type': 'text/html' } }) });
    assert.equal((await handler(request())).status, 413);
  });
  it('rejects non-HTML responses and invalid JSON requests', async () => {
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => Response.json({}) });
    assert.equal((await handler(request())).status, 422);
    assert.equal((await handler(new Request('https://example.com', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: '{' }))).status, 400);
  });
});
