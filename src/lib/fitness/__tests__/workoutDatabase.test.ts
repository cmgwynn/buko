import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const exercise = '33333333-3333-4333-8333-333333333333';
const privateExercise = '44444444-4444-4444-8444-444444444444';
const workoutId = '55555555-5555-4555-8555-555555555555';
const itemId = '66666666-6666-4666-8666-666666666666';
const setId = '77777777-7777-4777-8777-777777777777';
const planId = '88888888-8888-4888-8888-888888888888';
const migrations = new URL('../../../../supabase/migrations/', import.meta.url);

test('workout RPC is atomic, owner-scoped, completed-only, idempotent and exportable with cascading additions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      create table storage.buckets(id text primary key,name text,public boolean);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,
        created_at timestamptz default now(),updated_at timestamptz default now(),unique(bucket_id,name));
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/'); $$;
      grant usage on schema public,auth,storage to authenticated,service_role;
      insert into auth.users values('${owner}'),('${other}');
    `);
    for (const name of ['0001_init.sql', '0002_recipes_planning.sql', '0003_fitness.sql', '0007_account.sql', '0013_workout_mode.sql', '0015_nutrition_insights.sql', '0016_planning_preferences.sql']) {
      await db.exec(readFileSync(new URL(name, migrations), 'utf8'));
    }
    await db.exec(`
      insert into exercises(id,user_id,name,category) values
        ('${exercise}',null,'Built-in test lift','strength'),
        ('${privateExercise}','${other}','Other member lift','strength');
      grant select,insert,update,delete on all tables in schema public to authenticated;
      set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);
      insert into planned_workouts(id,user_id,planned_for,name) values('${planId}','${owner}','2026-10-24','Planned');
      insert into planning_preferences(user_id,excluded_foods,excluded_exercises)
        values('${owner}',array['peanuts'],array['${exercise}'::uuid]);
    `);
    const payload = {
      id: workoutId, name: 'Offline lift', started_at: '2026-10-23T10:00:00Z', completed_at: '2026-10-24T10:00:00Z',
      duration_min: 45, calories_burned: null, calories_estimated: true, health_export_requested: true,
      rating: 'right', planned_workout_id: planId,
      items: [{
        id: itemId, exercise_id: exercise, position: 0, rest_seconds: 90,
        notes: 'Controlled reps',
        sets: [
          { id: setId, position: 0, reps: 8, weight_kg: 20, completed_at: '2026-10-23T10:30:00Z', rpe: 8 },
          { id: '99999999-9999-4999-8999-999999999999', position: 1, reps: 100, weight_kg: 99, completed: false },
        ],
      }],
    };
    const save = (value: unknown, userId = owner) =>
      db.query<{ id: string }>('select save_completed_workout($1,$2) as id', [JSON.stringify(value), userId]);
    const invalid = structuredClone(payload);
    invalid.items[0].sets[0].rpe = 11;
    await assert.rejects(save(invalid), /set details|rpe/);
    assert.equal((await db.query('select * from workouts')).rows.length, 0);
    assert.equal((await db.query('select * from workout_exercises')).rows.length, 0);
    const privatePayload = structuredClone(payload);
    privatePayload.items[0].exercise_id = privateExercise;
    await assert.rejects(save(privatePayload), /unavailable/);
    assert.equal((await db.query('select * from workouts')).rows.length, 0);
    assert.equal((await save(payload)).rows[0].id, workoutId);
    assert.equal((await db.query('select * from workout_sets')).rows.length, 1);
    assert.equal((await db.query<{ rpe: number }>('select rpe from workout_sets')).rows[0].rpe, 8);
    assert.equal((await db.query<{ completed_workout_id: string }>('select completed_workout_id from planned_workouts')).rows[0].completed_workout_id, workoutId);
    assert.equal((await db.query('select * from workout_health_export_queue')).rows.length, 1);
    await db.query('select mark_workout_health_export($1,$2,$3,$4,$5)', [workoutId, 'writing', null, null, owner]);
    await db.query('select mark_workout_health_export($1,$2,$3,$4,$5)', [workoutId, 'exported', null, 'stable-health-receipt', owner]);
    assert.equal((await db.query<{ exported_external_id: string }>('select exported_external_id from workouts')).rows[0].exported_external_id, 'stable-health-receipt');
    assert.equal((await db.query<{ attempts: number }>('select attempts from workout_health_export_queue')).rows[0].attempts, 1);
    await save({ ...payload, name: 'Changed replay must not overwrite' });
    assert.equal((await db.query<{ name: string }>('select name from workouts')).rows[0].name, 'Offline lift');
    assert.equal((await db.query('select * from workout_sets')).rows.length, 1);
    await assert.rejects(save(payload, other), /account changed/);
    await assert.rejects(db.query('select mark_workout_health_export($1,$2,$3,$4,$5)', [workoutId, 'failed', 'No', null, other]), /account changed/);
    await db.exec(`select save_exercise_rest_preference('${exercise}',120,'${owner}');
      insert into workout_preferences(user_id,default_rest_seconds) values('${owner}',120);
      select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query('select * from workouts')).rows.length, 0);
    assert.equal((await db.query('select * from workout_preferences')).rows.length, 0);
    assert.equal((await db.query('select * from planning_preferences')).rows.length, 0);
    await assert.rejects(save(payload, other), /unavailable/);
    await assert.rejects(db.query(`insert into planned_workouts(id,user_id,planned_for,name,completed_workout_id)
      values(gen_random_uuid(),'${other}','2026-10-24','No','${workoutId}')`), /row-level security/);
    await db.exec(`reset role; set role anon`);
    await assert.rejects(save(payload), /permission denied/);
    await db.exec(`reset role; set role service_role`);
    const inventory = (await db.query<{ tables: string[] }>('select account_export_tables() as tables')).rows[0].tables;
    for (const table of ['planned_workouts', 'workout_preferences', 'exercise_rest_preferences', 'workout_health_export_queue', 'planning_preferences']) {
      assert.ok(inventory.includes(table));
    }
    await db.exec(`reset role; delete from auth.users where id='${owner}'`);
    for (const table of ['workouts', 'workout_sets', 'planned_workouts', 'workout_preferences', 'exercise_rest_preferences', 'workout_health_export_queue', 'planning_preferences']) {
      assert.equal((await db.query(`select * from ${table}`)).rows.length, 0, `${table} must cascade`);
    }
  } finally { await db.close(); }
});
