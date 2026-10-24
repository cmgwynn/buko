import { buildContext, CoachError, createCoachHandler, type CoachStore } from './handler.ts';
import { productContext } from './products.ts';
import type { CoachReply } from '../../../src/lib/coach/types.ts';
import type { DietPref } from '../../../src/types/index.ts';
import { PremiumError, requirePremium } from '../_shared/premium.ts';

const url = Deno.env.get('SUPABASE_URL');
const anon = Deno.env.get('SUPABASE_ANON_KEY');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anon || !service) throw new Error('Missing Supabase coach configuration.');
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const model = Deno.env.get('ANTHROPIC_MODEL');
const enabled = Deno.env.get('COACH_AI_ENABLED') === 'true' && Boolean(apiKey && model);
const limit = Number(Deno.env.get('COACH_GLOBAL_DAILY_REQUESTS') ?? '100');
if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid coach request budget.');

async function rest<T>(path: string, token: string, key: string, body?: unknown): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new CoachError(response.status === 401 || response.status === 403
      ? 'Your session or coach permissions need refreshing. Please log in again.'
      : 'Coach database is not ready. Ask the app owner to apply migration 0005 and redeploy the function.',
    response.status === 401 || response.status === 403 ? 401 : 503);
  }
  return await response.json();
}
Deno.serve(createCoachHandler({
  enabled,
  async authenticate(token): Promise<CoachStore> {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon! }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new CoachError('Please log in again.', 401); }
    const user = await response.json();
    if (typeof user.id !== 'string') throw new CoachError('Please log in again.', 401);
    const userId: string = user.id;
    return {
      userId,
      async authorizePremium() {
        try { await requirePremium(url!, anon!, token); }
        catch (error) {
          if (error instanceof PremiumError) throw new CoachError(error.message, error.status);
          throw error;
        }
      },
      query: <T>(table: string, query: string) => rest<T[]>(`${table}?${query}&user_id=eq.${userId}`, token, anon!),
      reserve: () => rest<boolean>('rpc/reserve_coach_request', service!, service!, { p_user_id: userId, p_global_limit: limit }),
      publish: (reply) => rest<CoachReply>('rpc/publish_coach_reply', service!, service!, { p_user_id: userId, p_reply: reply }),
    };
  },
  context(store, today, message, kind) {
    return buildContext(store, today, message, kind, (codes, diet) => productContext(codes, diet.filter((value): value is DietPref =>
      ['vegetarian','vegan','gluten_free','dairy_free','nut_free'].includes(value))));
  },
  async model(system, context) {
    // No paid calls unless explicitly enabled. The model name is also an owner-controlled secret.
    if (!enabled || !apiKey || !model) throw new CoachError('Live AI is disabled.', 503);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1400, temperature: 0.2, system, messages: [{ role: 'user', content: JSON.stringify(context) }] }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new CoachError('The AI provider is unavailable or its budget was reached. No recommendation was saved.', 502); }
    const data = await response.json();
    if (data.stop_reason !== 'end_turn' || !Array.isArray(data.content)) throw new Error('Coach returned an invalid response.');
    const text = data.content.filter((part: { type: string; text?: string }) => part.type === 'text').map((part: { text: string }) => part.text).join('');
    if (text.length > 12000) throw new Error('Coach returned an invalid response.');
    try { return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { throw new Error('Coach returned an invalid response. Please try again.'); }
  },
}));
