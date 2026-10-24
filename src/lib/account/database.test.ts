import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createAccountHandler, type AccountStore, type DataPage } from '../../../supabase/functions/account/handler';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const recipe = '33333333-3333-4333-8333-333333333333';
const exercise = '44444444-4444-4444-8444-444444444444';
const routine = '55555555-5555-4555-8555-555555555555';
const workout = '66666666-6666-4666-8666-666666666666';
const workoutExercise = '77777777-7777-4777-8777-777777777777';
const reply = '88888888-8888-4888-8888-888888888888';
const migrations = new URL('../../../supabase/migrations/', import.meta.url);
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(
      id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,
      created_at timestamptz default now(),updated_at timestamptz default now(),
      unique(bucket_id,name)
    );
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name,'/');
    $$;
    grant usage on schema public,auth,storage to authenticated,service_role;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${alice}'),('${bob}');
  `);
  for (const file of readdirSync(migrations).filter((name) => /^000[1-7]_.*\.sql$/.test(name)).sort()) {
    await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  await db.exec(readFileSync(new URL('0007_account.sql', migrations), 'utf8'));
  await db.exec(`
    create table if not exists public.diagnostic_usage(
      user_id uuid primary key references auth.users(id) on delete cascade,
      minute_start timestamptz default now(), count int default 0
    );
    create table public.future_subscription_events(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade, detail jsonb
    );
    insert into profiles(user_id,goal,sex,birth_year,birth_date,height_cm,weight_kg,activity_level)
      values('${alice}','maintain','unspecified',1990,'1990-01-02',170,70,'moderate'),
      ('${bob}','maintain','unspecified',1991,'1991-01-01',175,75,'light');
    insert into nutrition_targets(user_id,calories,protein_g,carbs_g,fat_g,bmr,tdee) values('${alice}',2000,100,200,70,1500,2000);
    insert into food_log_entries(user_id,logged_on,meal,source,name,quantity,unit,grams)
      values('${alice}',current_date,'lunch','manual','Beans',1,'bowl',200);
    insert into grocery_items(user_id,name) values('${alice}','Beans');
    insert into recipes(id,user_id,title) values('${recipe}','${alice}','Bean bowl');
    insert into recipe_ingredients(recipe_id,user_id,position,raw_text,name)
      select '${recipe}','${alice}',n,'Beans '||n,'Beans' from generate_series(1,5) n;
    insert into recipe_steps(recipe_id,user_id,position,text) values('${recipe}','${alice}',0,'Mix');
    insert into meal_plan_entries(user_id,planned_on,meal,recipe_id) values('${alice}',current_date,'dinner','${recipe}');
    insert into pantry_items(user_id,name,canonical_name) values('${alice}','Beans','beans');
    insert into exercises(id,user_id,name,category) values('${exercise}','${alice}','My lift','strength');
    insert into routines(id,user_id,name) values('${routine}','${alice}','My routine');
    insert into routine_exercises(routine_id,user_id,exercise_id,position) values('${routine}','${alice}','${exercise}',0);
    insert into workouts(id,user_id,name,routine_id,source,external_id,exported_external_id)
      values('${workout}','${alice}','Imported workout','${routine}','healthkit','apple-health-original','written-health-copy');
    insert into workout_exercises(id,workout_id,user_id,exercise_id,position)
      values('${workoutExercise}','${workout}','${alice}','${exercise}',0);
    insert into workout_sets(workout_exercise_id,user_id,position,reps) values('${workoutExercise}','${alice}',0,10);
    insert into body_measurements(user_id,measured_on,kind,value) values('${alice}',current_date,'weight',70);
    insert into daily_activity(user_id,day,steps,source) values('${alice}',current_date,10000,'healthkit');
    insert into user_settings(user_id,health_read_steps) values('${alice}',true);
    insert into coach_preferences(user_id,consent_version) values('${alice}','2026-10-23');
    insert into coach_days(user_id,day,complete) values('${alice}',current_date,true);
    insert into coach_target_snapshots(user_id,day,calories,protein_g,carbs_g,fat_g) values('${alice}',current_date,2000,100,200,70);
    insert into coach_replies(id,user_id,kind,text) values('${reply}','${alice}','chat','Eat balanced meals');
    insert into coach_actions(user_id,reply_id,kind,title,detail,payload)
      values('${alice}','${reply}','recipe','Bean bowl','Review','{}');
    insert into coach_usage(user_id,minute_start,day) values('${alice}',now(),current_date);
    insert into coach_budget(day,reserved_calls) values(current_date,1);
    insert into subscription_access(user_id,expires_at) values('${alice}',now()+interval '1 month');
    insert into billing_usage(user_id) values('${alice}');
    insert into diagnostic_usage(user_id) values('${alice}');
    insert into future_subscription_events(user_id,detail) values('${alice}','{"provider":"future"}');
    insert into storage.objects(bucket_id,name,metadata) values
      ('recipe-photos','${alice}/nested/photo.jpg','{"size":100}'),
      ('recipe-photos','${bob}/keep.jpg','{"size":100}');
  `);
  return db;
}
async function rpc<T>(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ result: T }>(`select ${sql} as result`, args)).rows[0].result;
}
async function inventory(db: PGlite) {
  return rpc<string[]>(db, 'public.account_export_tables()');
}

describe('account migration against all app schemas', () => {
  it('exports all owned data and child rows through real SQL pagination, including future tables', async () => {
    const db = await database();
    try {
      const store: AccountStore = {
        userId: alice, user: { id: alice }, authenticatedAt: Date.now() / 1000,
        tables: () => inventory(db),
        page: (table, offset, limit) => rpc<DataPage>(db, 'public.account_export_page($1,$2,$3,$4)', [alice, table, offset, limit]),
        photos: (offset, limit) => rpc<DataPage>(db, 'public.account_photo_page($1,$2,$3)', [alice, offset, limit]),
        downloadPhoto: async () => new Response(new Uint8Array([255, 216, 255]), { headers: { 'Content-Type': 'image/jpeg' } }),
        removePhotos: async () => { throw new Error('must not delete'); },
        deleteSubscriber: async () => { throw new Error('must not delete'); },
        deleteAuth: async () => { throw new Error('must not delete'); },
      };
      const handler = createAccountHandler({ authenticate: async () => store, pageSize: 2 });
      const response = await handler(new Request('https://example.com', {
        method: 'POST', headers: { Authorization: 'Bearer verified' }, body: '{"action":"export"}',
      }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.recipe_ingredients.length, 5);
      assert.equal(body.data.profiles.length, 1);
      assert.equal(body.data.profiles[0].birth_date, '1990-01-02');
      assert.equal(body.data.workouts[0].external_id, 'apple-health-original');
      assert.equal(body.data.workout_sets[0].reps, 10);
      for (const table of await inventory(db)) {
        assert.ok(body.data[table].length > 0, `${table} must be exported`);
        assert.ok(body.data[table].every((row: { user_id: string }) => row.user_id === alice));
      }
      assert.equal(body.assets.length, 1);
      assert.equal(body.assets[0].name, `${alice}/nested/photo.jpg`);
      assert.equal(body.assets[0].path, `${alice}/nested/photo.jpg`);
      assert.equal(body.assets[0].contentType, 'image/jpeg');
      assert.deepEqual([...Buffer.from(body.assets[0].base64, 'base64')], [255, 216, 255]);
      assert.equal(body.data.coach_budget, undefined);
      assert.equal(body.data.billing_config, undefined);
      assert.equal(body.data.exercises.length, 1, 'shared/seeded exercises are excluded');
    } finally { await db.close(); }
  });
  it('restricts every export RPC to service_role and prevents table-name injection', async () => {
    const db = await database();
    try {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        for (const sql of [
          'select public.account_export_tables()',
          `select public.account_export_page('${bob}','profiles',0,2)`,
          `select public.account_photo_page('${bob}',0,2)`,
        ]) await assert.rejects(db.query(sql), /permission denied/);
        await db.exec('reset role');
      }
      await db.exec('set role service_role');
      assert.ok((await inventory(db)).includes('subscription_access'));
      const page = await rpc<DataPage>(db, 'public.account_export_page($1,$2,0,2)', [alice, 'coach_usage']);
      assert.equal(page.rows.length, 1, 'service-only usage must be included');
      await assert.rejects(rpc(db, 'public.account_export_page($1,$2,0,2)', [alice, 'profiles; drop table profiles']), /Invalid account export request/);
      await assert.rejects(rpc(db, 'public.account_export_page($1,$2,0,2)', [alice, 'billing_config']), /Invalid account export request/);
      await assert.rejects(rpc(db, 'public.account_export_page($1,$2,0,501)', [alice, 'profiles']), /Invalid account export request/);
    } finally { await db.close(); }
  });
  it('detects same-count changes and returns a bounded explicit oversize indicator', async () => {
    const db = await database();
    try {
      const before = await rpc<DataPage>(db, 'public.account_export_page($1,$2,0,2)', [alice, 'recipe_steps']);
      await db.exec("update recipe_steps set text='Changed'");
      const after = await rpc<DataPage>(db, 'public.account_export_page($1,$2,0,2)', [alice, 'recipe_steps']);
      assert.equal(before.total, after.total);
      assert.notEqual(before.revision, after.revision);
      await db.exec(`insert into future_subscription_events(user_id) select '${alice}' from generate_series(1,25000);`);
      const oversized = await rpc<DataPage>(db, 'public.account_export_page($1,$2,0,2)', [alice, 'future_subscription_events']);
      assert.equal(oversized.total, 25001);
      assert.deepEqual(oversized.rows, []);
      assert.equal(oversized.revision, 'assisted-export-required');
    } finally { await db.close(); }
  });
  it('blocks auth deletion until photos are removed, then cascades ALL personal rows without exercise-RESTRICT failures', async () => {
    const db = await database();
    try {
      const tables = await inventory(db);
      await assert.rejects(db.exec(`delete from auth.users where id='${alice}'`), /Remove account storage objects/);
      assert.equal((await db.query('select * from workout_sets')).rows.length, 1, 'failed auth delete rolls back all DB mutations');
      await db.exec(`delete from storage.objects where bucket_id='recipe-photos' and split_part(name,'/',1)='${alice}';
        delete from auth.users where id='${alice}';`);
      for (const table of tables) {
        const remaining = await rpc<DataPage>(db, 'public.account_export_page($1,$2,0,2)', [alice, table]);
        assert.equal(remaining.total, 0, `${table} must cascade`);
      }
      assert.equal((await db.query(`select * from auth.users where id='${bob}'`)).rows.length, 1);
      assert.equal((await db.query(`select * from profiles where user_id='${bob}'`)).rows.length, 1);
      assert.equal((await db.query(`select * from storage.objects where name='${bob}/keep.jpg'`)).rows.length, 1);
      assert.ok((await db.query('select * from exercises where user_id is null')).rows.length > 0, 'shared exercises survive');
      assert.equal((await db.query('select * from coach_budget')).rows.length, 1, 'nonpersonal global budget survives');
      await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('recipe-photos','${alice}/orphan.jpg')`), /account no longer exists/);
      await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('recipe-photos','invalid-owner/photo.jpg')"), /Invalid recipe photo owner/);
    } finally { await db.close(); }
  });
  it('refuses success for a photo uploaded in the cleanup-to-auth gap, then safely retries only that owner', async () => {
    const db = await database();
    try {
      let injectLateUpload = true;
      const store: AccountStore = {
        userId: alice, user: { id: alice }, authenticatedAt: Date.now() / 1000,
        tables: () => inventory(db),
        page: (table, offset, limit) => rpc<DataPage>(db, 'public.account_export_page($1,$2,$3,$4)', [alice, table, offset, limit]),
        photos: (offset, limit) => rpc<DataPage>(db, 'public.account_photo_page($1,$2,$3)', [alice, offset, limit]),
        downloadPhoto: async () => { throw new Error('must not export'); },
        removePhotos: async (paths) => {
          for (const path of paths) await db.query(
            "delete from storage.objects where bucket_id='recipe-photos' and split_part(name,'/',1)=$1 and name=$2",
            [alice, path],
          );
        },
        deleteSubscriber: async () => {
          if (injectLateUpload) {
            injectLateUpload = false;
            await db.query("insert into storage.objects(bucket_id,name) values('recipe-photos',$1)", [`${alice}/late-upload.jpg`]);
          }
          return 'not_configured';
        },
        deleteAuth: async () => { await db.query('delete from auth.users where id=$1', [alice]); },
      };
      const handler = createAccountHandler({ authenticate: async () => store });
      const request = () => new Request('https://example.com', {
        method: 'POST', headers: { Authorization: 'Bearer verified' },
        body: '{"action":"delete","confirmation":"DELETE"}',
      });
      const first = await handler(request());
      assert.equal(first.status, 503);
      const failure = await first.json();
      assert.equal(failure.code, 'DELETION_INCOMPLETE');
      assert.equal(failure.stage, 'auth');
      assert.equal((await db.query('select id from auth.users where id=$1', [alice])).rows.length, 1);
      const retry = await handler(request());
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).deleted, true);
      assert.equal((await db.query("select name from storage.objects where split_part(name,'/',1)=$1", [alice])).rows.length, 0);
      assert.equal((await db.query("select name from storage.objects where name=$1", [`${bob}/keep.jpg`])).rows.length, 1);
    } finally { await db.close(); }
  });
});
