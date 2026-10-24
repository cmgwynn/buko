import { createRecipeQualityHandler, type RecipeQualityStore } from './handler.ts';
import { RecipeQualityError } from '../../../src/lib/recipes/quality/pipeline.ts';
import { type BaseVersion } from '../../../src/lib/recipes/quality/types.ts';
import { PremiumError, requirePremium } from '../_shared/premium.ts';

const url = Deno.env.get('SUPABASE_URL');
const anon = Deno.env.get('SUPABASE_ANON_KEY');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anon || !service) throw new Error('Missing recipe-quality Supabase configuration.');
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const model = Deno.env.get('ANTHROPIC_MODEL');
const enabled = Deno.env.get('RECIPE_AI_ENABLED') === 'true' && Boolean(apiKey && model);
const globalLimit = Number(Deno.env.get('RECIPE_AI_GLOBAL_DAILY_REQUESTS') ?? '100');
if (!Number.isInteger(globalLimit) || globalLimit < 1 || globalLimit > 10000) throw new Error('Invalid recipe AI request budget.');

async function rpc<T>(name: string, token: string, key: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new RecipeQualityError('Recipe quality storage or permissions are unavailable. No suggestion was returned.', 'storage_unavailable', 503);
  }
  return await response.json();
}

Deno.serve(createRecipeQualityHandler({
  enabled,
  async authenticate(token): Promise<RecipeQualityStore> {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon! }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new RecipeQualityError('Please sign in again.', 'unauthenticated', 401); }
    const user = await response.json();
    if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new RecipeQualityError('Please sign in again.', 'unauthenticated', 401);
    const userId: string = user.id;
    return {
      userId,
      async authorizePremium() {
        try { await requirePremium(url!, anon!, token); }
        catch (error) {
          if (error instanceof PremiumError) throw new RecipeQualityError(error.message, 'premium_required', error.status);
          throw error;
        }
      },
      approved: () => rpc<BaseVersion[]>('recipe_quality_approved', token, anon!),
      tasteProfile: () => rpc('recipe_quality_taste_profile', token, anon!),
      completed: (requestId) => rpc('recipe_quality_result', token, anon!, { p_request_id: requestId }),
      claim: (requestId) => rpc<boolean>('recipe_quality_claim', service!, service!, { p_user_id: userId, p_request_id: requestId }),
      async dietaryPreferences() {
        const response = await fetch(`${url}/rest/v1/profiles?select=diet_prefs&user_id=eq.${userId}&limit=1`, {
          headers: { Authorization: `Bearer ${token}`, apikey: anon! }, signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) { await response.body?.cancel(); throw new RecipeQualityError('Saved diet preferences could not be verified.', 'diet_unavailable', 503); }
        const rows = await response.json();
        if (!Array.isArray(rows) || !Array.isArray(rows[0]?.diet_prefs) || rows[0].diet_prefs.some((s: unknown) => typeof s !== 'string'))
          throw new RecipeQualityError('Set up your dietary preferences before requesting a recipe.', 'diet_unavailable', 422);
        return rows[0].diet_prefs;
      },
      reserve: (requestId, kind, attempt) => rpc<boolean>('recipe_quality_reserve', service!, service!, {
        p_user_id: userId, p_request_id: requestId, p_global_limit: globalLimit, p_kind: kind, p_attempt: attempt,
      }),
      publish: (result, requestId) => rpc<string>('recipe_quality_publish', service!, service!, {
        p_user_id: userId, p_request_id: requestId, p_result: result,
      }),
    };
  },
  async model(system, context) {
    if (!enabled || !apiKey || !model) throw new RecipeQualityError('Recipe AI is disabled.', 'ai_disabled', 503);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 12000, temperature: 0.1, system,
        messages: [{ role: 'user', content: JSON.stringify(context) }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new RecipeQualityError('Recipe AI provider is unavailable or its budget was reached.', 'provider_unavailable', 502); }
    const data = await response.json();
    if (data.stop_reason !== 'end_turn' || !Array.isArray(data.content)) throw new RecipeQualityError('Recipe AI returned an incomplete response.', 'invalid_model_response', 502);
    const text = data.content.filter((part: { type: string; text?: string }) => part.type === 'text')
      .map((part: { text: string }) => part.text).join('');
    if (text.length > 100000) throw new RecipeQualityError('Recipe AI response exceeded the size limit.', 'invalid_model_response', 502);
    try { return JSON.parse(text); }
    catch { throw new RecipeQualityError('Recipe AI returned invalid JSON.', 'invalid_model_response', 502); }
  },
}));
