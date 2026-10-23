import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createImportHandler } from '../../../../supabase/functions/import-recipe/handler';
import { importRecipeFromHtml, importRecipeFromUrl, importRecipeViaBackend, MAX_RECIPE_BYTES, normaliseUrl, supportedRecipeUrl, SUPPORTED_RECIPE_HOSTS } from '../importer';

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
  it('uses the same authenticated backend for native import', async () => {
    assert.equal(importRecipeFromUrl, importRecipeViaBackend);
    const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      assert.equal(input, 'https://project.supabase.co/functions/v1/import-recipe');
      return Response.json({ html, sourceUrl: url });
    });
    try {
      assert.equal((await importRecipeFromUrl(url, { supabaseUrl: 'https://project.supabase.co', anonKey: 'key', accessToken: 'token' })).sourceUrl, url);
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
  it('normalises supported addresses and rejects unsafe or unsupported inputs before fetch', async () => {
    assert.equal(supportedRecipeUrl('  WWW.ALLRECIPES.COM/recipe/1  '), 'https://www.allrecipes.com/recipe/1');
    assert.throws(() => normaliseUrl('   '), /Enter a recipe/);
    const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not fetch'); });
    try {
      for (const target of [
        'https://example.com/recipe', 'http://allrecipes.com/recipe', 'https://allrecipes.com.evil.test/',
        'https://recipes.allrecipes.com/', 'https://user:pass@allrecipes.com/', 'https://allrecipes.com:8443/',
        'file:///recipe', 'https://127.0.0.1/',
      ]) {
        await assert.rejects(importRecipeViaBackend(target, { supabaseUrl: 'https://project.supabase.co', anonKey: 'key', accessToken: 'token' }));
      }
      assert.equal(fetchMock.mock.callCount(), 0);
    } finally { fetchMock.mock.restore(); }
  });
  it('reports network errors with the text fallback', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new TypeError('network'); });
    try {
      await assert.rejects(importRecipeViaBackend(url, { supabaseUrl: 'https://project.supabase.co', anonKey: 'key', accessToken: 'token' }), /paste the ingredients and steps/);
    } finally { fetchMock.mock.restore(); }
  });
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
  it('reports site blocks with a paste fallback without bypassing restrictions', async () => {
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => new Response('Blocked', { status: 403 }) });
    const response = await handler(request());
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /403.*paste its ingredients and steps/);
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
  it('accepts only explicit supported hosts and www variants', async () => {
    for (const host of SUPPORTED_RECIPE_HOSTS) {
      for (const target of [`https://${host}/recipe`, `https://www.${host}/recipe`]) {
        assert.equal(supportedRecipeUrl(target), target);
        const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () =>
          new Response(html, { headers: { 'Content-Type': 'text/html' } }),
        });
        assert.equal((await handler(request(target))).status, 200);
      }
    }
  });
  it('allows safe relative and supported-host redirects and retains final attribution', async () => {
    const targets: string[] = [];
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async (target) => {
      targets.push(String(target));
      if (targets.length < 3) return new Response(null, { status: 302, headers: {
        Location: targets.length === 1 ? '/final' : 'https://www.budgetbytes.com/recipe/',
      } });
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    } });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.deepEqual(targets, [url, 'https://www.simplyrecipes.com/final', 'https://www.budgetbytes.com/recipe/']);
    assert.equal((await response.json()).sourceUrl, targets[2]);
  });
  it('revalidates every redirect, including after an allowed redirect', async () => {
    for (const location of [
      'http://allrecipes.com/', 'https://allrecipes.com.evil.test/', 'https://evil.test/',
      'https://user:password@allrecipes.com/', 'https://allrecipes.com:8443/', 'https://[::1]/',
    ]) {
      let calls = 0;
      const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => {
        calls++;
        return new Response(null, { status: 307, headers: { Location: calls === 1 ? 'https://allrecipes.com/recipe/' : location } });
      } });
      assert.equal((await handler(request())).status, 400);
      assert.equal(calls, 2);
    }
  });
  it('limits redirect loops and rejects missing or malformed redirect locations', async () => {
    let calls = 0;
    const loop = createImportHandler({ authenticate: async () => true, fetchPage: async () => {
      calls++;
      return new Response(null, { status: 302, headers: { Location: '/loop' } });
    } });
    assert.equal((await loop(request())).status, 422);
    assert.equal(calls, 6);
    const redirectHeaders: HeadersInit[] = [{}, { Location: 'https://[' }];
    for (const headers of redirectHeaders) {
      const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => new Response(null, { status: 302, headers }) });
      assert.equal((await handler(request())).status, 422);
    }
  });
  it('rejects oversized URL request bodies before contacting a site', async () => {
    let calls = 0;
    const handler = createImportHandler({ authenticate: async () => true, fetchPage: async () => {
      calls++;
      return new Response(html);
    } });
    assert.equal((await handler(request(`${url}${'x'.repeat(4096)}`))).status, 413);
    assert.equal(calls, 0);
  });
});
