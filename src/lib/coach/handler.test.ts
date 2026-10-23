import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildContext, CoachError, createCoachHandler, type CoachDependencies, type CoachStore, type Context } from '../../../supabase/functions/coach/handler';
import { summarizeWeek } from './core';
import type { CoachReply } from './types';

const today = () => new Date().toISOString().slice(0, 10);
const facts = summarizeWeek({ start: '2026-10-12', end: '2026-10-18', logs: [], complete: [], targets: [], workouts: [], weights: [], scores: [] });
function fixture(overrides: Partial<CoachDependencies> = {}) {
  const calls = { model: 0, reserve: 0, publish: [] as Record<string, unknown>[], query: [] as { table: string; query: string }[], context: 0 };
  let consent = true, safety = false, quota = true;
  const store: CoachStore = {
    userId: 'test-user',
    async query<T>(table: string, query: string): Promise<T[]> {
      calls.query.push({ table, query });
      return (table === 'coach_preferences' ? [{ consent_version: consent ? '2026-10-23' : null }]
        : query.includes('safety=eq.true') && safety ? [{ id: 'support' }] : []) as T[];
    },
    async reserve() { calls.reserve++; return quota; },
    async publish(data) {
      calls.publish.push(data);
      return { id: 'reply', ...data, actions: [] } as unknown as CoachReply;
    },
  };
  const deps: CoachDependencies = {
    enabled: true, authenticate: async () => store,
    async context() { calls.context++; return { facts, candidates: [], focus: 'balanced', goal: 'maintain', diet: [] }; },
    async model() { calls.model++; return { text: 'Keep building helpful habits.', suggestions: ['Make logging easier.', 'Plan a satisfying meal.', 'Choose enjoyable movement.'], refs: [] }; },
    ...overrides,
  };
  return { calls, store, deps, setConsent: (value: boolean) => { consent = value; }, setSafety: (value: boolean) => { safety = value; }, setQuota: (value: boolean) => { quota = value; } };
}
const request = (operation: string, message?: string) => new Request('https://example.test/coach', {
  method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ operation, today: today(), message }),
});
describe('authenticated coach handler', () => {
  it('rejects missing authentication and respects disabled AI without calling the model', async () => {
    const f = fixture({ enabled: false });
    const handler = createCoachHandler(f.deps);
    assert.equal((await handler(new Request('https://example.test', { method: 'POST' }))).status, 401);
    const status = await (await handler(request('status'))).json();
    assert.equal(status.enabled, false);
    assert.equal((await handler(request('weekly'))).status, 503);
    assert.equal(f.calls.model, 0); assert.equal(f.calls.reserve, 0);
  });
  it('requires consent and checks quota atomically before context or provider requests', async () => {
    const f = fixture(); const handler = createCoachHandler(f.deps);
    f.setConsent(false);
    assert.equal((await handler(request('chat', 'Hello'))).status, 403);
    f.setConsent(true); f.setQuota(false);
    assert.equal((await handler(request('weekly'))).status, 429);
    assert.equal(f.calls.model, 0); assert.equal(f.calls.context, 0);
  });
  it('returns supportive and medical referrals without provider calls even when AI is off or quota exhausted', async () => {
    const f = fixture({ enabled: false }); const handler = createCoachHandler(f.deps);
    f.setQuota(false);
    const reply = await (await handler(request('chat', 'I want to stop eating'))).json();
    assert.equal(reply.safety, true); assert.match(reply.text, /866-662-1235/); assert.deepEqual(reply.actions, []);
    const medical = await (await handler(request('chat', 'Should I change my medication?'))).json();
    assert.match(medical.text, /healthcare professional/);
    assert.equal(f.calls.model, 0); assert.equal(f.calls.reserve, 0);
  });
  it('retains supportive mode across future requests and withholds cached numeric reviews', async () => {
    const f = fixture(); f.setSafety(true);
    const reply = await (await createCoachHandler(f.deps)(request('weekly'))).json();
    assert.equal(reply.safety, true); assert.equal(f.calls.context, 0); assert.equal(f.calls.model, 0);
  });
  it('bounds request body and rejects invalid dates', async () => {
    const f = fixture(); const handler = createCoachHandler(f.deps);
    assert.equal((await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: 'x'.repeat(9000) }))).status, 413);
    assert.equal((await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ operation: 'weekly', today: '2026-02-30' }) }))).status, 400);
  });
  it('provides factual summaries without paid calls and validates before publishing AI output', async () => {
    const f = fixture({ enabled: false });
    const summary = await (await createCoachHandler(f.deps)(request('summary'))).json();
    assert.deepEqual(summary.facts, facts); assert.equal(f.calls.model, 0);
    const supportive = fixture({ model: async () => ({ text: 'Eat 800 calories.', suggestions: ['a', 'b', 'c'], refs: [] }) });
    const safetyReply = await (await createCoachHandler(supportive.deps)(request('weekly'))).json();
    assert.equal(safetyReply.safety, true);
    assert.match(safetyReply.text, /866-662-1235/);
    assert.equal(safetyReply.facts, null);
    const unsafe = fixture({ model: async () => ({ text: 'Target 1500 calories.', suggestions: ['a', 'b', 'c'], refs: [] }) });
    assert.equal((await createCoachHandler(unsafe.deps)(request('weekly'))).status, 502);
    assert.equal(unsafe.calls.publish.length, 0);
    const good = fixture();
    assert.equal((await createCoachHandler(good.deps)(request('weekly'))).status, 200);
    assert.equal(good.calls.publish.length, 1);
  });
  it('sends minimized context without account identifiers, raw rows, emails or exact birthdays', async () => {
    let sent: Record<string, unknown> | null = null;
    const f = fixture({ model: async (_system, context) => {
      sent = context; return { text: 'Enjoy a balanced meal.', suggestions: [], refs: [] };
    } });
    await createCoachHandler(f.deps)(request('chat', 'contact example@example.com about meals'));
    const serialized = JSON.stringify(sent);
    assert.ok(!serialized.includes('test-user')); assert.ok(!serialized.includes('example@example.com'));
    assert.ok(!serialized.includes('birth_date')); assert.ok(!serialized.includes('access_token'));
  });
  it('returns a proper authentication error from the adapter', async () => {
    const f = fixture({ authenticate: async () => { throw new CoachError('Expired session', 401); } });
    assert.equal((await createCoachHandler(f.deps)(request('weekly'))).status, 401);
  });
});
describe('server context selection', () => {
  it('does not fetch weight or imported workouts and rejects incomplete recipes for numeric constraints', async () => {
    const queried: { table: string; query: string }[] = [];
    const store: CoachStore = {
      userId: 'user',
      async query<T>(table: string, query: string): Promise<T[]> {
        queried.push({ table, query });
        const values: Record<string, unknown[]> = {
          profiles: [{ goal: 'maintain', diet_prefs: [] }], coach_preferences: [{ focus: 'protein', include_weight: false }],
          recipes: [
            { id: 'complete', title: 'Bean bowl', servings: 1, recipe_ingredients: [{ grams: 100, nutrition: { per100g: { calories: 550, protein: 25 } } }] },
            { id: 'partial', title: 'Unknown bowl', servings: 1, recipe_ingredients: [{ grams: 100, nutrition: null }] },
            { id: 'over', title: 'Over limit', servings: 1, recipe_ingredients: [{ grams: 100, nutrition: { per100g: { calories: 650, protein: 25 } } }] },
            { id: 'rounding', title: 'Rounds to limit', servings: 1, recipe_ingredients: [{ grams: 100, nutrition: { per100g: { calories: 599.9, protein: 25 } } }] },
            { id: 'invalid', title: 'Invalid nutrition', servings: 1, recipe_ingredients: [{ grams: 100, nutrition: { per100g: { calories: -100, protein: 25 } } }] },
          ],
        };
        return (values[table] ?? []) as T[];
      },
      reserve: async () => true, publish: async () => { throw new Error('Not used'); },
    };
    const result: Context = await buildContext(store, today(), 'Find high-protein dinners under 600 calories', 'chat', async () => ({ scores: new Map(), candidates: [] }));
    assert.deepEqual(result.candidates.map((c) => 'recipe_id' in c.payload ? c.payload.recipe_id : null), ['complete']);
    assert.ok(result.candidates.every((candidate) => candidate.calories! < 600 && candidate.protein! >= 20));
    assert.equal(queried.some((q) => q.table === 'body_measurements'), false);
    assert.match(queried.find((q) => q.table === 'workouts')!.query, /source=eq.buko/);
  });
});
