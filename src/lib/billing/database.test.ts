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
