import { boundedJson, BodyError } from '../_shared/body.ts';
import { COMMUNITY_CUISINES, COMMUNITY_MEALS, DIET_TAGS } from '../../../src/lib/recipes/communityPolicy.ts';
import { isRecord } from '../../../src/lib/recipes/quality/checks.ts';
import { RecipeQualityError, suggestRecipe } from '../../../src/lib/recipes/quality/pipeline.ts';
import { RECIPE_QUALITY_CONSENT_VERSION, type BaseVersion, type QualityResult, type RecipeConstraints, type RecipeModel } from '../../../src/lib/recipes/quality/types.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export interface RecipeQualityStore {
  userId: string;
  authorizePremium(): Promise<void>;
  approved(): Promise<BaseVersion[]>;
  tasteProfile(): Promise<{ preferences: Record<string, unknown>; learned?: Record<string, unknown> }>;
  dietaryPreferences(): Promise<string[]>;
  completed(requestId: string): Promise<{ recipeId: string; disposition: QualityResult['disposition']; note: string } | null>;
  claim(requestId: string): Promise<boolean>;
  reserve(requestId: string, kind: 'adapt' | 'review', attempt: number): Promise<boolean>;
  publish(result: QualityResult, requestId: string): Promise<string>;
}
export interface RecipeQualityDependencies {
  enabled: boolean;
  authenticate(token: string): Promise<RecipeQualityStore>;
  model: RecipeModel;
}
function stringList(value: unknown, max: number, allowed?: readonly string[]): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== 'string'
    || !item.trim() || item.length > 100 || allowed && !allowed.includes(item)))
    throw new RecipeQualityError('Choose valid, bounded recipe preferences.', 'invalid_request');
  return [...new Set(value.map((item: string) => item.trim()))];
}
export function parseRecipeConstraints(value: unknown): RecipeConstraints {
  const keys = ['dietTags', 'excludedIngredients', 'cuisine', 'mealType', 'maxMinutes', 'targetCalories', 'targetProtein',
    'preferredCuisines', 'spiceTolerance', 'dislikedIngredients', 'maxCookMinutes', 'weeknight'];
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key)))
    throw new RecipeQualityError('Send valid recipe constraints.', 'invalid_request');
  const result: RecipeConstraints = {
    dietTags: stringList(value.dietTags, 5, DIET_TAGS),
    excludedIngredients: stringList(value.excludedIngredients, 30),
  };
  if (value.cuisine != null) {
    if (!COMMUNITY_CUISINES.includes(value.cuisine as never)) throw new RecipeQualityError('Choose a supported cuisine.', 'invalid_request');
    result.cuisine = value.cuisine as string;
  }
  if (value.mealType != null) {
    if (!COMMUNITY_MEALS.includes(value.mealType as never)) throw new RecipeQualityError('Choose a supported meal type.', 'invalid_request');
    result.mealType = value.mealType as string;
  }
  for (const [key, max] of [['maxMinutes', 1440], ['targetCalories', 5000], ['targetProtein', 500], ['maxCookMinutes', 1440]] as const) {
    const v = value[key];
    if (v == null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max)
      throw new RecipeQualityError('Choose positive, bounded time and macro targets.', 'invalid_request');
    result[key] = v;
  }
  if (value.preferredCuisines !== undefined) result.preferredCuisines = stringList(value.preferredCuisines, 11, COMMUNITY_CUISINES);
  if (value.dislikedIngredients !== undefined) result.dislikedIngredients = stringList(value.dislikedIngredients, 30);
  if (value.spiceTolerance !== undefined) {
    if (!['mild', 'medium', 'hot'].includes(String(value.spiceTolerance))) throw new RecipeQualityError('Choose a spice preference.', 'invalid_request');
    result.spiceTolerance = value.spiceTolerance as RecipeConstraints['spiceTolerance'];
  }
  if (value.weeknight !== undefined && typeof value.weeknight !== 'boolean') throw new RecipeQualityError('Choose a valid weeknight preference.', 'invalid_request');
  result.weeknight = value.weeknight as boolean | undefined ?? result.mealType === 'Dinner';
  return result;
}
export function applyTasteProfile(
  constraints: RecipeConstraints,
  profile: { preferences: Record<string, unknown>; learned?: Record<string, unknown> },
  dietaryPreferences: string[],
): RecipeConstraints {
  const preferences = isRecord(profile?.preferences) ? profile.preferences : {};
  const learned = isRecord(profile?.learned) ? profile.learned : {};
  const list = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length <= 100).slice(0, 30) : [];
  const dietMap: Record<string, string> = { vegan: 'Vegan', vegetarian: 'Vegetarian', gluten_free: 'Gluten-free', dairy_free: 'Dairy-free', nut_free: 'Nut-free' };
  const authoritativeDiet = dietaryPreferences.map((tag) => {
    const mapped = dietMap[tag] ?? (DIET_TAGS.includes(tag as never) ? tag : null);
    if (!mapped) throw new RecipeQualityError('A saved diet restriction is unsupported. Review dietary preferences before requesting a recipe.', 'unsupported_diet', 422);
    return mapped;
  });
  const cuisines = list(preferences.preferredCuisines);
  const count = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(n, 1000000) : 0;
  const spice = isRecord(learned.spiceFeedback) ? learned.spiceFeedback : {};
  const tags = isRecord(learned.tagCounts) ? learned.tagCounts : {};
  const result: RecipeConstraints = {
    ...constraints, dietTags: [...new Set([...constraints.dietTags, ...authoritativeDiet])],
    preferredCuisines: (constraints.preferredCuisines?.length ? constraints.preferredCuisines
      : cuisines.length ? cuisines : list(learned.preferredCuisines)).filter((s) => COMMUNITY_CUISINES.includes(s as never)),
    dislikedIngredients: [...new Set([...(constraints.dislikedIngredients ?? []), ...list(preferences.dislikedIngredients), ...list(learned.dislikedIngredients)])],
    learnedTaste: {
      spiceFeedback: { tooHot: count(spice.tooHot), tooMild: count(spice.tooMild), justRight: count(spice.justRight) },
      tagCounts: Object.fromEntries(['too bland', 'too salty', 'too complicated', 'family loved it'].map((tag) => [tag, count(tags[tag])])),
    },
  };
  if (result.spiceTolerance === undefined && ['mild', 'medium', 'hot'].includes(String(preferences.spiceTolerance)))
    result.spiceTolerance = preferences.spiceTolerance as RecipeConstraints['spiceTolerance'];
  const minutes = preferences.maxCookMinutes == null ? learned.typicalCookingMinutes : preferences.maxCookMinutes;
  if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440)
    result.maxCookMinutes = Math.min(result.maxCookMinutes ?? Infinity, minutes);
  return result;
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createRecipeQualityHandler(deps: RecipeQualityDependencies) {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Use POST.', code: 'method_not_allowed' }, 405);
    try {
      const bearer = request.headers.get('authorization');
      if (!bearer?.startsWith('Bearer ') || !bearer.slice(7).trim()) throw new RecipeQualityError('Please sign in to use recipe suggestions.', 'unauthenticated', 401);
      const store = await deps.authenticate(bearer.slice(7));
      const body = await boundedJson(request, 16384);
      if (!isRecord(body)) throw new RecipeQualityError('Send a valid recipe request.', 'invalid_request');
      if (body.operation === 'status') return json({ enabled: deps.enabled, consentVersion: RECIPE_QUALITY_CONSENT_VERSION });
      if (body.operation !== 'suggest' || !uuid(body.requestId)
        || body.baseVersionId !== undefined && !uuid(body.baseVersionId)
        || Object.keys(body).some((key) => !['operation', 'requestId', 'constraints', 'baseVersionId'].includes(key)))
        throw new RecipeQualityError('Send a valid suggest request and request UUID.', 'invalid_request');
      let constraints = parseRecipeConstraints(body.constraints);
      await store.authorizePremium();
      const completed = await store.completed(body.requestId);
      if (completed) return json(completed);
      if (!await store.claim(body.requestId)) {
        const saved = await store.completed(body.requestId);
        if (saved) return json(saved);
        throw new RecipeQualityError('This recipe request is still being processed. Retry the same request after it finishes; interrupted requests can be retried after three minutes.', 'request_in_progress', 409);
      }
      const [bases, profile, diet] = await Promise.all([store.approved(), store.tasteProfile(), store.dietaryPreferences()]);
      const preferences = isRecord(profile?.preferences) ? profile.preferences : {};
      const consent = preferences.aiConsentVersion === RECIPE_QUALITY_CONSENT_VERSION;
      constraints = applyTasteProfile(constraints, profile, diet);
      const result = await suggestRecipe({
        bases, constraints, baseVersionId: body.baseVersionId as string | undefined,
        enabled: deps.enabled && consent, model: deps.model,
        disabledReason: !deps.enabled ? 'Live recipe AI is disabled; no model request was made.'
          : 'Recipe AI consent is missing or out of date; no data was sent to a model.',
        reserve: (kind, attempt) => store.reserve(body.requestId as string, kind, attempt),
      });
      const recipeId = await store.publish(result, body.requestId);
      if (!uuid(recipeId)) throw new RecipeQualityError('The private recipe could not be saved.', 'publish_failed', 502);
      const saved = await store.completed(body.requestId);
      if (!saved || saved.recipeId !== recipeId) throw new RecipeQualityError('The saved recipe outcome could not be verified. Retry the same request to retrieve it.', 'publish_unverified', 502);
      return json(saved);
    } catch (error) {
      if (error instanceof RecipeQualityError) return json({ error: error.message, code: error.code }, error.status);
      if (error instanceof BodyError) return json({ error: error.message, code: 'invalid_request' }, error.status);
      // Do not log user preferences, recipes, provider responses, tokens or credentials.
      console.error('Recipe quality request failed:', error instanceof Error ? error.name : 'UnknownError');
      return json({ error: 'Recipe suggestions are unavailable. No suggestion was returned; retry later.', code: 'unavailable' }, 502);
    }
  };
}
