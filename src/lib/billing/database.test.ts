import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
it('keeps preview free, enforces owner-only verified production access, and blocks forged or expired entitlements', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to authenticated,service_role;
      insert into auth.users values('${alice}'),('${bob}');
      create table meal_plan_entries(user_id uuid,servings numeric,planned_on date,meal text,recipe_id uuid,logged_at timestamptz);
      create table daily_activity(user_id uuid);
      create table workouts(user_id uuid,source text);
      create table coach_actions(user_id uuid,applied_at timestamptz);
      alter table meal_plan_entries enable row level security;
      create policy plan_owner on meal_plan_entries to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant all on meal_plan_entries to authenticated;
    `);
    const sql = readFileSync(new URL('../../../supabase/migrations/0006_subscriptions.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    const asUser = async (query: string, user = alice) => {
      await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
      try { return await db.query(query); } finally { await db.exec('reset role'); }
    };
    assert.deepEqual((await asUser('select has_premium_access() as ok')).rows, [{ ok: true }]);
    await db.exec('update billing_config set enforce_premium=true');
    assert.deepEqual((await asUser('select has_premium_access() as ok')).rows, [{ ok: false }]);
    await assert.rejects(asUser(`insert into subscription_access(user_id,expires_at) values('${alice}',now()+interval '1 year')`), /permission denied/);
    await assert.rejects(asUser('update billing_config set enforce_premium=false'), /permission denied/);
    await assert.rejects(asUser(`insert into meal_plan_entries(user_id,servings) values('${alice}',1)`), /row-level security/);
    await db.exec(`insert into subscription_access values('${alice}',now()+interval '1 day',now(),false)`);
    await asUser(`insert into meal_plan_entries(user_id,servings) values('${alice}',1)`);
    assert.deepEqual((await asUser('select has_premium_access() as ok', bob)).rows, [{ ok: false }]);
    assert.equal((await asUser('select * from subscription_access', bob)).rows.length, 0);
    await db.exec(`update subscription_access set sandbox=true`);
    assert.deepEqual((await asUser('select has_premium_access() as ok')).rows, [{ ok: false }]);
    await db.exec('update billing_config set allow_sandbox=true');
    assert.deepEqual((await asUser('select has_premium_access() as ok')).rows, [{ ok: true }]);
    await db.exec(`update subscription_access set verified_at=now()-interval '16 minutes'`);
    assert.deepEqual((await asUser('select has_premium_access() as ok')).rows, [{ ok: false }]);
    await db.exec(`update subscription_access set verified_at=now(),expires_at=now()-interval '1 second'`);
    assert.deepEqual((await asUser('select has_premium_access() as ok')).rows, [{ ok: false }]);
    assert.equal((await asUser('select * from meal_plan_entries')).rows.length, 1);
    await asUser('update meal_plan_entries set logged_at=now()');
    await assert.rejects(asUser('update meal_plan_entries set servings=2'), /Premium/);
    await asUser('delete from meal_plan_entries');
    const reserve = async () => (await db.query<{ allowed: boolean }>(`select reserve_billing_refresh('${alice}') as allowed`)).rows[0].allowed;
    for (let i = 0; i < 10; i++) assert.equal(await reserve(), true);
    assert.equal(await reserve(), false);
    await assert.rejects(asUser(`select reserve_billing_refresh('${alice}')`), /permission denied/);
  } finally { await db.close(); }
});
it('0017 keeps meal planning free under enforcement, scopes feedback to its owner and stores only aggregate usage', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key, created_at timestamptz not null default now());
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to authenticated,service_role;
      insert into auth.users(id) values('${alice}'),('${bob}');
      create table meal_plan_entries(user_id uuid,servings numeric,planned_on date,meal text,recipe_id uuid,logged_at timestamptz);
      create table daily_activity(user_id uuid);
      create table workouts(user_id uuid,source text);
      create table coach_actions(user_id uuid,applied_at timestamptz);
      alter table meal_plan_entries enable row level security;
      create policy plan_owner on meal_plan_entries to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant all on meal_plan_entries to authenticated;
      alter table workouts enable row level security;
      create policy workout_owner on workouts to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant all on workouts to authenticated;
    `);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/0006_subscriptions.sql', import.meta.url), 'utf8'));
    const sql = readFileSync(new URL('../../../supabase/migrations/0017_trial_readiness.sql', import.meta.url), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec('update billing_config set enforce_premium=true');
    const asUser = async (query: string, user = alice) => {
      await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
      try { return await db.query(query); } finally { await db.exec('reset role'); }
    };
    await asUser(`insert into meal_plan_entries(user_id,servings) values('${alice}',1)`);
    await asUser('update meal_plan_entries set servings=2');
    await assert.rejects(asUser(`insert into workouts(user_id,source) values('${alice}','apple_health')`), /row-level security/);
    await asUser(`insert into feedback(user_id,category,message,platform) values('${alice}','idea','Add more breakfasts','web')`);
    await assert.rejects(asUser(`insert into feedback(user_id,category,message,platform) values('${alice}','idea','x','web')`), /check/);
    await assert.rejects(asUser(`insert into feedback(user_id,category,message,platform) values('${alice}','idea','Spoofed','web')`, bob), /row-level security/);
    assert.equal((await asUser('select * from feedback', bob)).rows.length, 0);
    for (let i = 0; i < 9; i++) await asUser(`insert into feedback(user_id,category,message,platform) values('${alice}','bug','Report ${i}','ios')`);
    await assert.rejects(asUser(`insert into feedback(user_id,category,message,platform) values('${alice}','bug','One more','ios')`), /limit/);
    await asUser(`select record_daily_use('web')`); await asUser(`select record_daily_use('web')`, bob);
    await asUser(`select record_daily_use('web')`); await asUser(`select record_daily_use('ios')`, bob);
    await assert.rejects(asUser('select * from usage_daily_seen'), /permission denied/);
    await assert.rejects(asUser(`select record_daily_use('desktop')`), /Unknown platform/);
    await assert.rejects(asUser('select * from usage_daily'), /permission denied/);
    const rows = (await db.query<{ active_users: number }>('select * from usage_daily')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].active_users, 2);
    assert.ok(!Object.keys(rows[0]).includes('user_id'));
  } finally { await db.close(); }
});
