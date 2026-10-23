import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const recipe = '33333333-3333-4333-8333-333333333333';
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema public,auth to authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${alice}'),('${bob}');
    create table public.profiles(user_id uuid primary key references auth.users,diet_prefs text[] not null default '{}');
    insert into public.profiles(user_id) values('${alice}'),('${bob}');
    create table public.recipes(id uuid primary key,user_id uuid not null references auth.users,updated_at timestamptz not null default now());
    create table public.meal_plan_entries(
      id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,
      planned_on date not null,meal text not null,recipe_id uuid references recipes,servings numeric not null);
    create table public.grocery_items(
      id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,
      name text not null,source text not null,source_id text,barcode text,quantity text);
    insert into recipes(id,user_id) values('${recipe}','${alice}');
  `);
  const migration = readFileSync(new URL('../../../supabase/migrations/0005_coach.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Owner reruns must not reproduce the migration-0004 duplicate-constraint problem.
  await db.exec(`insert into coach_preferences(user_id,consent_version) values('${alice}','2026-10-23'),('${bob}','2026-10-23');`);
  return db;
}
async function asUser(db: PGlite, user: string, sql: string) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  try { return await db.query(sql); }
  finally { await db.exec('reset role;'); }
}
async function publish(db: PGlite, owner: string, actions = true, safety = false) {
  const recipeDate = (await db.query<{ updated_at: string }>('select updated_at from recipes limit 1')).rows[0].updated_at;
  const result = await db.query<{ reply: { id: string; actions: { id: string }[] } }>(
    'select public.publish_coach_reply($1,$2::jsonb) as reply',
    [owner, JSON.stringify({
      kind: 'chat', text: 'Enjoy a balanced meal.', message: 'Meal idea', safety, suggestions: [],
      facts: null, actions: actions ? [{ kind: 'recipe', title: 'Bean bowl', detail: 'Review ingredients.', payload: { recipe_id: recipe, recipe_updated_at: recipeDate } }] : [],
    })],
  );
  return result.rows[0].reply;
}
describe('coach PostgreSQL migration and authorization', () => {
  it('is rerunnable, protects per-user data, prevents forged replies and restricts privileged RPCs', async () => {
    const db = await database();
    try {
      const reply = await publish(db, alice);
      const own = await asUser(db, alice, 'select id from coach_replies');
      assert.equal(own.rows.length, 1);
      const other = await asUser(db, bob, 'select id from coach_replies');
      assert.equal(other.rows.length, 0);
      await assert.rejects(asUser(db, bob, `insert into coach_replies(user_id,kind,text) values('${bob}','chat','forged')`), /permission denied/);
      await assert.rejects(asUser(db, alice, `select reserve_coach_request('${alice}',100)`), /permission denied/);
      await assert.rejects(asUser(db, bob, `select apply_coach_action('${reply.actions[0].id}',current_date,'dinner',1)`), /Suggestion not found/);
      const snapshot = await asUser(db, alice, `insert into coach_target_snapshots values('${alice}',current_date,2000,100,200,70) returning day`);
      assert.equal(snapshot.rows.length, 1);
      await assert.rejects(asUser(db, bob, `insert into coach_target_snapshots values('${alice}',current_date+1,2000,100,200,70)`), /row-level security/);
    } finally { await db.close(); }
  });
  it('applies a confirmed action once, preserves user data on retry and clears only owned history', async () => {
    const db = await database();
    try {
      const reply = await publish(db, alice);
      const id = reply.actions[0].id;
      const first = await asUser(db, alice, `select apply_coach_action('${id}',current_date,'dinner',1) as id`);
      const second = await asUser(db, alice, `select apply_coach_action('${id}',current_date,'dinner',2) as id`);
      assert.deepEqual(first.rows, second.rows);
      assert.equal((await db.query('select id from meal_plan_entries')).rows.length, 1);
      await asUser(db, bob, 'select clear_coach_history()');
      assert.equal((await db.query('select id from coach_replies')).rows.length, 1);
      await asUser(db, alice, 'select clear_coach_history()');
      assert.equal((await db.query('select id from coach_replies')).rows.length, 0);
      assert.equal((await db.query('select id from coach_actions')).rows.length, 0);
      assert.equal((await db.query('select id from meal_plan_entries')).rows.length, 1);
    } finally { await db.close(); }
  });
  it('withholds actions after support mode or consent withdrawal and checks recipe ownership', async () => {
    const db = await database();
    try {
      const reply = await publish(db, alice);
      await db.exec(`update coach_preferences set consent_version=null where user_id='${alice}'`);
      await assert.rejects(asUser(db, alice, `select apply_coach_action('${reply.actions[0].id}',current_date,'dinner',1)`), /consent/);
      await db.exec(`update coach_preferences set consent_version='2026-10-23' where user_id='${alice}'`);
      await publish(db, alice, false, true);
      await assert.rejects(publish(db, alice), /Support mode/);
      await assert.rejects(asUser(db, alice, `select apply_coach_action('${reply.actions[0].id}',current_date,'dinner',1)`), /paused/);
      await asUser(db, alice, 'select clear_coach_history()');
      const foreign = await publish(db, bob);
      await assert.rejects(asUser(db, bob, `select apply_coach_action('${foreign.actions[0].id}',current_date,'dinner',1)`), /Recipe no longer available/);
    } finally { await db.close(); }
  });
  it('enforces minute, day and global quotas in the database', async () => {
    const db = await database();
    try {
      const reserve = async (user: string, limit = 100) => (await db.query<{ ok: boolean }>('select reserve_coach_request($1,$2) as ok', [user, limit])).rows[0].ok;
      for (let i = 0; i < 5; i++) assert.equal(await reserve(alice), true);
      assert.equal(await reserve(alice), false);
      await db.exec(`update coach_usage set minute_start=now()-interval '2 minutes',day_count=29 where user_id='${alice}'`);
      assert.equal(await reserve(alice), true);
      await db.exec(`update coach_usage set minute_start=now()-interval '2 minutes' where user_id='${alice}'`);
      assert.equal(await reserve(alice), false);
      assert.equal(await reserve(bob, 6), false);
    } finally { await db.close(); }
  });
  it('rejects expired, changed-recipe and newly restricted food suggestions', async () => {
    const db = await database();
    try {
      const reply = await publish(db, alice);
      const action = `select apply_coach_action('${reply.actions[0].id}',current_date,'dinner',1)`;
      await db.exec(`update profiles set diet_prefs=array['vegan'] where user_id='${alice}'`);
      await assert.rejects(asUser(db, alice, action), /dietary/);
      await db.exec(`update profiles set diet_prefs='{}' where user_id='${alice}'; update recipes set updated_at=now()+interval '1 second'`);
      await assert.rejects(asUser(db, alice, action), /Recipe changed/);
      await db.exec(`update coach_replies set created_at=now()-interval '15 days'`);
      await assert.rejects(asUser(db, alice, action), /expired/);
      assert.equal((await db.query('select id from meal_plan_entries')).rows.length, 0);
    } finally { await db.close(); }
  });
  it('adds an alternative once and preserves its barcode for grocery product navigation', async () => {
    const db = await database();
    try {
      const result = await db.query<{ reply: { actions: { id: string }[] } }>(
        'select public.publish_coach_reply($1,$2::jsonb) as reply', [alice, JSON.stringify({
          kind: 'chat', text: 'Try this alternative.', suggestions: [], safety: false,
          actions: [{ kind: 'product', title: 'Beans', detail: 'Review ingredients.',
            payload: { source_id: '1234567890123', name: 'Beans' } }],
        })]);
      const id = result.rows[0].reply.actions[0].id;
      await asUser(db, alice, `select apply_coach_action('${id}',null,null,null)`);
      await asUser(db, alice, `select apply_coach_action('${id}',null,null,null)`);
      const items = await db.query<{ source: string; source_id: string; barcode: string }>('select source,source_id,barcode from grocery_items');
      assert.deepEqual(items.rows, [{ source: 'off', source_id: '1234567890123', barcode: '1234567890123' }]);
    } finally { await db.close(); }
  });
});
