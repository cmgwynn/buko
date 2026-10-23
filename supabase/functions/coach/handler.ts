import {
  calendarDate, COACH_SYSTEM, MEDICAL_MESSAGE, needsClinician, needsSupport, previousWeek,
  redactText, shiftDay, summarizeWeek, SUPPORT_MESSAGE, validateModelReply,
  type LogFact, type WeightFact,
} from '../../../src/lib/coach/core.ts';
import { COACH_CONSENT_VERSION, type Candidate, type CoachReply, type WeeklyFacts } from '../../../src/lib/coach/types.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export class CoachError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export interface CoachStore {
  userId: string;
  query<T>(table: string, query: string): Promise<T[]>;
  reserve(): Promise<boolean>;
  publish(data: Record<string, unknown>): Promise<CoachReply>;
}
export interface Context {
  facts: WeeklyFacts;
  candidates: Candidate[];
  focus: string;
  goal: string;
  diet: string[];
}
export interface CoachDependencies {
  enabled: boolean;
  authenticate(token: string): Promise<CoachStore>;
  context(store: CoachStore, today: string, message: string, kind: 'chat' | 'weekly'): Promise<Context>;
  model(system: string, context: Record<string, unknown>): Promise<unknown>;
}
async function requestBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new CoachError('Send a coach request.');
  const reader = request.body.getReader();
  let size = 0, body = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new CoachError('Message is too long.', 413); }
      body += decoder.decode(value, { stream: true });
    }
    const value: unknown = JSON.parse(body + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (err) {
    if (err instanceof CoachError) throw err;
    throw new CoachError('Send a valid JSON coach request.');
  } finally { reader.releaseLock(); }
}
export function createCoachHandler(deps: CoachDependencies) {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    try {
      const bearer = request.headers.get('authorization');
      if (!bearer?.startsWith('Bearer ')) throw new CoachError('Please log in to use the coach.', 401);
      const store = await deps.authenticate(bearer.slice(7));
      const body = await requestBody(request);
      if (body.operation === 'status') return json({ enabled: deps.enabled, provider: 'Anthropic', consentVersion: COACH_CONSENT_VERSION });
      const preference = (await store.query<{ consent_version: string | null }>('coach_preferences', 'select=consent_version&limit=1'))[0];
      if (preference?.consent_version !== COACH_CONSENT_VERSION) throw new CoachError('Review and accept coach data-sharing consent first.', 403);
      if (!calendarDate(body.today)) throw new CoachError('Choose a valid local date.');
      const utcToday = new Date().toISOString().slice(0, 10);
      if (body.today < shiftDay(utcToday, -1) || body.today > shiftDay(utcToday, 1)) throw new CoachError('Your device date is out of sync. Please correct it.');
      const kind = body.operation === 'weekly' || body.operation === 'summary' ? 'weekly' : body.operation === 'chat' ? 'chat' : null;
      if (!kind) throw new CoachError('Unknown coach operation.');
      if (kind === 'chat' && (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000)) throw new CoachError('Enter a message of at most 2000 characters.');
      const message = kind === 'chat' ? String(body.message).trim() : '';
      const safetyRows = await store.query<{ id: string }>('coach_replies', 'select=id&safety=eq.true&limit=1');
      const support = safetyRows.length > 0 || needsSupport(message);
      // Safety does not depend on an AI subscription or quota, and is checked before cached content.
      if (support || needsClinician(message)) {
        return json(await store.publish({
          kind: 'chat', text: support ? SUPPORT_MESSAGE : MEDICAL_MESSAGE, safety: support,
          message: support ? '[Support conversation]' : '[Health-professional referral]', suggestions: [], facts: null, actions: [],
        }));
      }
      const range = previousWeek(body.today);
      if (body.operation === 'summary') {
        if (!(await store.reserve())) throw new CoachError('Coach review limit reached. Please try later.', 429);
        return json({ facts: (await deps.context(store, body.today, '', 'weekly')).facts, enabled: deps.enabled });
      }
      if (kind === 'weekly') {
        const cached = await store.query<CoachReply>('coach_replies',
          `select=*,actions:coach_actions(id,kind,title,detail,applied_at)&kind=eq.weekly&week_start=eq.${range.start}&limit=1`);
        if (cached[0]) return json({ ...cached[0], cached: true });
      }
      if (!deps.enabled) throw new CoachError('Live AI is off. The app owner must explicitly enable the Anthropic integration in Supabase. No model request was made.', 503);
      if (!(await store.reserve())) throw new CoachError('Coach request limit reached. Try later; limits are 5 per minute and 30 per UTC day, with a shared daily budget.', 429);
      const context = await deps.context(store, body.today, message, kind);
      const history = kind === 'chat' ? await store.query<{ message: string | null; text: string }>('coach_replies',
        'select=message,text&kind=eq.chat&order=created_at.desc&limit=4') : [];
      const candidates = context.candidates.slice(0, 8);
      const response = await deps.model(COACH_SYSTEM, {
        mode: kind, message: redactText(message), focus: context.focus, goal: context.goal, dietaryPreferences: context.diet,
        facts: context.facts,
        history: history.reverse().map((row) => ({ user: redactText(row.message ?? ''), coach: redactText(row.text).slice(0, 800) })),
        candidates: candidates.map(({ ref, title, kind: candidateKind, detail, calories, protein }) => ({
          ref, title: redactText(title), kind: candidateKind, detail: redactText(detail), calories, protein,
        })),
      });
      if (needsSupport(JSON.stringify(response))) {
        return json(await store.publish({
          kind: 'chat', text: SUPPORT_MESSAGE, safety: true, message: '[Support conversation]',
          suggestions: [], facts: null, actions: [],
        }));
      }
      const valid = validateModelReply(response, candidates, kind === 'weekly');
      const reply = await store.publish({
        kind, week_start: kind === 'weekly' ? range.start : null, message: kind === 'chat' ? redactText(message) : null,
        text: valid.text, suggestions: valid.suggestions, facts: context.facts, safety: false,
        actions: candidates.filter((candidate) => valid.refs.includes(candidate.ref)),
      });
      return json(reply);
    } catch (err) {
      if (err instanceof CoachError) return json({ error: err.message }, err.status);
      // Never log messages, context, credentials, or provider response bodies.
      console.error('Coach request failed:', err instanceof Error ? err.name : 'UnknownError');
      return json({ error: err instanceof Error && /wellness safety|invalid response/.test(err.message)
        ? err.message : 'Coach is unavailable. No advice or actions were applied. Please retry later.' }, 502);
    }
  };
}

export async function buildContext(
  store: CoachStore, today: string, message: string, kind: 'chat' | 'weekly',
  products: (codes: string[], diet: string[]) => Promise<{ scores: Map<string, number | null>; candidates: Candidate[] }>,
): Promise<Context> {
  const range = kind === 'weekly' ? previousWeek(today) : { start: shiftDay(today, -6), end: today };
  const between = (column: string) => `${column}=gte.${range.start}&${column}=lte.${range.end}`;
  const [logs, days, targets, workouts, prefs, profiles] = await Promise.all([
    store.query<LogFact>('food_log_entries', `select=logged_on,calories,protein_g,source,source_id&${between('logged_on')}&order=logged_on&limit=2001`),
    store.query<{ day: string }>('coach_days', `select=day&complete=eq.true&${between('day')}&limit=8`),
    store.query<{ day: string; calories: number }>('coach_target_snapshots', `select=day,calories&${between('day')}&limit=8`),
    store.query<{ duration_min: number | null }>('workouts', `select=duration_min&source=eq.buko&started_at=gte.${range.start}T00:00:00Z&started_at=lt.${shiftDay(range.end, 1)}T00:00:00Z&limit=501`),
    store.query<{ focus: string; include_weight: boolean }>('coach_preferences', 'select=focus,include_weight&limit=1'),
    store.query<{ goal: string; diet_prefs: string[] }>('profiles', 'select=goal,diet_prefs&limit=1'),
  ]);
  if (logs.length > 2000 || workouts.length > 500) throw new CoachError('This date range contains too much data for a bounded coach review. Please contact support.', 422);
  const diet = profiles[0]?.diet_prefs ?? [];
  const weights = prefs[0]?.include_weight ? await store.query<WeightFact>('body_measurements',
    `select=day:measured_on,value&kind=eq.weight&${between('measured_on')}&limit=101`) : [];
  if (weights.length > 100) throw new CoachError('Too many measurements for a bounded weekly review. Please contact support.', 422);
  const counts = new Map<string, number>();
  for (const log of logs) if (log.source === 'off' && log.source_id && /^\d{8,14}$/.test(log.source_id)) counts.set(log.source_id, (counts.get(log.source_id) ?? 0) + 1);
  const codes = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!).slice(0, 4);
  const productData = codes.length ? await products(codes, diet) : { scores: new Map<string, number | null>(), candidates: [] };
  const scores = logs.filter((log) => log.source === 'off').map((log) => productData.scores.get(log.source_id ?? '') ?? null);
  const facts = summarizeWeek({ ...range, logs, complete: days.map((day) => day.day), targets, workouts, weights, scores });
  facts.limitations.push('Workout date boundaries use UTC; sessions near local midnight may fall in an adjacent week.');
  if (!prefs[0]?.include_weight) facts.limitations.push('Weight sharing is off; no weight data was read or sent.');
  if (counts.size > 4) facts.limitations.push('Product scores cover only the most frequently logged identifiable products (at most four).');
  const recipeRows = await store.query<{
    id: string; title: string; servings: number; updated_at: string;
    recipe_ingredients: { grams: number | null; nutrition: { per100g: { calories: number | null; protein: number | null } } | null }[];
  }>('recipes', 'select=id,title,servings,updated_at,recipe_ingredients(grams,nutrition)&order=updated_at.desc&limit=40');
  const maxCalories = /\b(?:under|below|less than)\s+(\d{2,4})\s*(?:k?cal|calories)/i.exec(message);
  const requestedMax = maxCalories ? Number(maxCalories[1]) : null;
  const minProtein = /\bhigh[- ]protein\b/i.test(message) ? 20 : 0;
  const recipes: Candidate[] = [];
  if (!diet.length) for (const recipe of recipeRows) {
    const ingredients = recipe.recipe_ingredients;
    if (!(recipe.servings > 0) || !ingredients.length || ingredients.some((ingredient) => !(Number(ingredient.grams) > 0) ||
      ingredient.nutrition?.per100g.calories == null || ingredient.nutrition?.per100g.protein == null ||
      !Number.isFinite(Number(ingredient.nutrition.per100g.calories)) || Number(ingredient.nutrition.per100g.calories) < 0 ||
      !Number.isFinite(Number(ingredient.nutrition.per100g.protein)) || Number(ingredient.nutrition.per100g.protein) < 0)) continue;
    const calories = ingredients.reduce((sum, ing) => sum + Number(ing.grams) * Number(ing.nutrition!.per100g.calories) / 100, 0) / recipe.servings;
    const protein = ingredients.reduce((sum, ing) => sum + Number(ing.grams) * Number(ing.nutrition!.per100g.protein) / 100, 0) / recipe.servings;
    const displayCalories = Math.ceil(calories);
    const displayProtein = Math.floor(protein * 10) / 10;
    if (!Number.isFinite(calories) || !Number.isFinite(protein) || calories <= 0 ||
      (requestedMax !== null && displayCalories >= requestedMax) || protein < minProtein) continue;
    recipes.push({
      ref: `recipe-${recipes.length}`, kind: 'recipe', title: recipe.title.slice(0, 160),
      detail: `${displayCalories} kcal and ${displayProtein} g protein per serving, estimated from matched ingredients. Review suitability and allergens.`,
      payload: { recipe_id: recipe.id, recipe_updated_at: recipe.updated_at }, calories: displayCalories, protein: displayProtein,
    });
    if (recipes.length >= 5) break;
  }
  if (diet.length) facts.limitations.push('Automatic food actions are withheld for dietary restrictions because allergen/dietary suitability is not verified.');
  facts.limitations.push('Saved recipes have no meal-type classification. Nutrition-matched ideas are not certified dinner recipes; review suitability and choose the meal slot before adding.');
  if (!recipes.length) facts.limitations.push('No eligible saved recipes with complete calorie/protein matching met the request. Do not invent a meal plan.');
  return { facts, candidates: [...recipes, ...productData.candidates].slice(0, 8), focus: prefs[0]?.focus ?? 'balanced', goal: profiles[0]?.goal ?? 'maintain', diet };
}
