import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCommunityHandler } from '../../../../supabase/functions/community/handler';
import { communitySnapshot } from '../communityPolicy';
import { STARTER_RECIPES, starterRecipeDraft } from '../library';

const user = '11111111-1111-4111-8111-111111111111';
const recipeId = '22222222-2222-4222-8222-222222222222';
const body = { recipeId, description: 'My original recipe', meal: 'Dinner', cuisine: 'Everyday', tags: ['Vegetarian'], confirmRights: true };
function fixture(options: { denied?: boolean; owner?: string; dbFailure?: boolean; missing?: boolean } = {}) {
  const draft = starterRecipeDraft(STARTER_RECIPES[0]);
  const r = { user_id: options.owner ?? user, title: draft.title, servings: draft.servings, prep_minutes: draft.prepMinutes,
    cook_minutes: draft.cookMinutes, community_parent_id: null, photo_path: 'private/photo.jpg', source_url: 'https://private.test',
    recipe_ingredients: draft.ingredients, recipe_steps: draft.steps };
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: user }), { status: options.denied ? 401 : 200 });
    if (url.includes('/rest/v1/recipes?')) return new Response(JSON.stringify(options.missing ? [] : [r]));
    if (url.endsWith('/rpc/community_publish')) return options.dbFailure
      ? new Response(JSON.stringify({ code: '23505' }), { status: 409 }) : new Response(JSON.stringify(recipeId));
    throw new Error(`Unexpected outbound request: ${url}`);
  };
  return { r, calls, handler: createCommunityHandler({ base: 'https://synthetic.test', anon: 'public-key', service: 'server-key', fetcher }) };
}
function request(input: unknown = body, token = 'user-token') {
  return new Request('https://community.test', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
describe('community publishing Edge Function', () => {
  it('authenticates, reads through owner RLS and computes a fresh score instead of trusting client values', async () => {
    const { handler, calls, r } = fixture();
    const response = await handler(request({ ...body, userId: 'forged-user', score: 100, payload: { title: 'Forged' }, parentId: 'forged-parent' }));
    assert.equal(response.status, 200);
    const sent = JSON.parse(String(calls[2].init?.body));
    const expected = communitySnapshot(r, r.recipe_ingredients, r.recipe_steps);
    assert.equal(sent.p_user, user);
    assert.equal(sent.p_score, expected.score);
    assert.equal(sent.p_payload.title, r.title);
    assert.equal(sent.p_parent, null);
    assert.ok(!JSON.stringify(sent).includes('private/photo'));
    assert.equal(new Headers(calls[1].init?.headers).get('Authorization'), 'Bearer user-token');
    assert.equal(new Headers(calls[2].init?.headers).get('Authorization'), 'Bearer server-key');
    assert.ok(!(await response.text()).includes('server-key'));
  });
  it('does not read or publish for invalid sessions, missing recipes or other owners', async () => {
    const denied = fixture({ denied: true });
    assert.equal((await denied.handler(request())).status, 401);
    assert.equal(denied.calls.length, 1);
    for (const options of [{ owner: 'other-user' }, { missing: true }]) {
      const f = fixture(options);
      assert.equal((await f.handler(request())).status, 404);
      assert.equal(f.calls.length, 2);
    }
  });
  it('requires sharing permission, validates categories and bounds request bytes before publishing', async () => {
    for (const input of [{ ...body, confirmRights: false }, { ...body, tags: ['Certified allergy safe'] }, { ...body, meal: 'anything' }]) {
      const f = fixture();
      assert.equal((await f.handler(request(input))).status, 400);
      assert.equal(f.calls.length, 1);
    }
    const f = fixture();
    assert.equal((await f.handler(request({ ...body, description: 'x'.repeat(13000) }))).status, 413);
    assert.equal(f.calls.length, 1);
    const malformed = new Request('https://community.test', { method: 'POST', headers: { Authorization: 'Bearer token' }, body: '{' });
    assert.equal((await f.handler(malformed)).status, 400);
  });
  it('surfaces persistence failures instead of claiming a publication succeeded', async () => {
    const f = fixture({ dbFailure: true });
    const response = await f.handler(request());
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /already been published/);
  });
  it('handles preflight and rejects wrong methods without backend requests', async () => {
    const f = fixture();
    assert.equal((await f.handler(new Request('https://community.test', { method: 'OPTIONS' }))).status, 200);
    assert.equal((await f.handler(new Request('https://community.test'))).status, 405);
    assert.equal(f.calls.length, 0);
  });
});
