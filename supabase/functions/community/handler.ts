import { communityPublishInput, communitySnapshot } from '../../../src/lib/recipes/communityPolicy.ts';
import { BodyError, boundedJson } from '../_shared/body.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

export function createCommunityHandler({ base, anon, service, fetcher = fetch }: { base: string; anon: string; service: string; fetcher?: typeof fetch }) {
return async (req: Request) => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Sign in to publish.' }, 401);
  try {
    const verified = await fetcher(`${base}/auth/v1/user`, { headers: { Authorization: authorization, apikey: anon }, signal: AbortSignal.timeout(10000) });
    if (!verified.ok) {
      await verified.body?.cancel();
      return verified.status === 401 || verified.status === 403 ? reply({ error: 'Sign in again.' }, 401)
        : reply({ error: 'Session verification unavailable. Please retry.' }, 503);
    }
    const user = await verified.json();
    if (typeof user.id !== 'string') return reply({ error: 'Sign in again.' }, 401);
    const input = communityPublishInput(await boundedJson(req, 12000));
    const response = await fetcher(`${base}/rest/v1/recipes?id=eq.${input.recipeId}&select=*,recipe_ingredients(*),recipe_steps(*)`, {
      headers: { Authorization: authorization, apikey: anon }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) { await response.body?.cancel(); return reply({ error: 'Cannot load your private recipe. Check backend setup.' }, 503); }
    const rows = await response.json();
    if (rows.length !== 1 || rows[0].user_id !== user.id) return reply({ error: 'Your saved recipe was not found.' }, 404);
    const r = rows[0];
    const parent = r.community_parent_id ?? null;
    if (parent && !input.changes) return reply({ error: 'Describe what changed in this variation before sharing it.' }, 400);
    if (!parent && input.changes) return reply({ error: 'Only recipe variations can include change notes.' }, 400);
    const scored = communitySnapshot(r, r.recipe_ingredients.sort((a: { position: number }, b: { position: number }) => a.position - b.position),
      r.recipe_steps.sort((a: { position: number }, b: { position: number }) => a.position - b.position));
    const published = await fetcher(`${base}/rest/v1/rpc/community_publish`, {
      method: 'POST', headers: { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_user: user.id, p_private: input.recipeId, p_description: input.description.trim(), p_meal: input.meal,
        p_cuisine: input.cuisine, p_tags: [...new Set(input.tags)], p_payload: scored.payload,
        p_score: scored.score, p_calories: scored.calories, p_parent: parent,
        ...(parent ? { p_changes: input.changes } : {}),
      }), signal: AbortSignal.timeout(15000),
    });
    if (!published.ok) {
      const error = await published.json();
      return reply({ error: error.code === '23505' ? 'This saved recipe has already been published. Make a new private copy to share a variation.'
        : error.code === 'PGRST202' ? (parent ? 'Deploy recipe-sharing migration 0011 before publishing variations.' : 'Deploy recipe-sharing migration 0009 before publishing.') : error.message ?? 'Publishing failed.' }, 400);
    }
    return reply({ id: await published.json() });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : 'Publishing failed. Please retry.' }, error instanceof BodyError ? error.status : 400);
  }
};
}
