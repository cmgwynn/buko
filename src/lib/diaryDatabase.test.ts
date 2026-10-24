import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
test('diary actions are owner-scoped, atomic, retry-safe, literal-searchable and cascade on deletion', async () => {
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
    const migrations = new URL('../../supabase/migrations/', import.meta.url);
    for (const file of readdirSync(migrations).filter((file) => /^00(?:0[1-9]|1[0-2])_.*\.sql$/.test(file)).sort()) {
      await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    await db.exec(`grant select,insert,update,delete on food_log_entries to authenticated;
      set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const id = (await db.query<{ id: string }>(`insert into food_log_entries(user_id,logged_on,meal,source,name,quantity,unit,grams,calories,protein_g,carbs_g,fat_g)
      values($1,current_date-1,'breakfast','manual','Salmon 100%_meal',1,'serving',150,300,30,0,10) returning id`, [owner])).rows[0].id;
    const today = (await db.query<{ date: string }>('select current_date::text as date')).rows[0].date;
    const yesterday = (await db.query<{ date: string }>('select (current_date-1)::text as date')).rows[0].date;
    const request = '33333333-3333-4333-8333-333333333333';
    const transfer = async (mode: string, req = request, expected = owner, entry: string | null = id, source: string | null = null, meal: string | null = 'lunch', target = today) =>
      (await db.query<{ result: { changed: number; skipped: number; entries: { id: string }[] } }>(
        'select diary_transfer($1,$2,$3,$4,$5,$6,$7,$8) as result', [req, expected, mode, target, today, entry, source, meal])).rows[0].result;
    const first = await transfer('copy');
    assert.equal(first.changed, 1);
    assert.deepEqual(await transfer('copy'), first);
    assert.equal((await db.query('select id from food_log_entries')).rows.length, 2);
    await assert.rejects(transfer('move'), /already used/);
    const day = await transfer('day', '44444444-4444-4444-8444-444444444444', owner, null, yesterday, null);
    assert.equal(day.changed, 1);
    const again = await transfer('day', '55555555-5555-4555-8555-555555555555', owner, null, yesterday, null);
    assert.equal(again.changed, 0); assert.equal(again.skipped, 1);
    await db.query(`insert into food_log_entries(user_id,logged_on,meal,source,name,quantity,unit,grams,calories,protein_g,carbs_g,fat_g)
      values($1,current_date-1,'breakfast','manual','Salmon 100%_meal',150.01,'g',150.01,300,30,0,10)`, [owner]);
    const repeats = await transfer('meal', '99999999-9999-4999-8999-999999999999', owner, null, yesterday, 'breakfast');
    assert.equal(repeats.changed, 1); assert.equal(repeats.skipped, 1);
    await assert.rejects(transfer('copy', '66666666-6666-4666-8666-666666666666', owner, id, null, 'invalid'), /valid/);
    await assert.rejects(transfer('copy', '66666666-6666-4666-8666-666666666666', owner, id, null, 'lunch', '2100-01-01'), /valid/);
    const moved = await transfer('move', '77777777-7777-4777-8777-777777777777', owner, id, null, 'dinner');
    assert.equal(moved.entries[0].id, id);
    const search = async (query: string, offset = 0) => (await db.query<{ result: { rows: { id: string }[] } }>('select diary_history_search($1,$2) as result', [query, offset])).rows[0].result.rows;
    assert.equal((await search('100%_meal')).length, 5);
    assert.equal((await search('100X_meal')).length, 0);
    await assert.rejects(search('%'), /2-100/);
    await db.query('select diary_favorite($1,true,$2)', [id, owner]);
    await db.query('select diary_favorite($1,true,$2)', [id, owner]);
    assert.equal((await db.query('select * from food_favorites')).rows.length, 1);
    const snapshot = (await db.query<{ snapshot: object }>('select snapshot from food_favorites')).rows[0].snapshot;
    assert.equal('health_external_id' in snapshot, false);
    const favoriteId = (await db.query<{ id: string }>('select id from food_favorites')).rows[0].id;
    await assert.rejects(db.query(`insert into food_favorites(user_id,food_key,snapshot) values($1,'injected','{}')`, [owner]), /permission denied/);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    assert.equal((await search('Salmon')).length, 0);
    assert.equal((await db.query('select * from food_favorites')).rows.length, 0);
    await assert.rejects(transfer('copy'), /expected account/);
    await assert.rejects(transfer('copy', '88888888-8888-4888-8888-888888888888', other), /unavailable/);
    await assert.rejects(db.query('select diary_favorite($1,true,$2)', [id, other]), /unavailable/);
    await assert.rejects(db.query('select diary_remove_favorite($1,$2)', [favoriteId, other]), /unavailable/);
    await assert.rejects(db.query('select * from diary_action_receipts'), /permission denied/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(search('Salmon'), /permission denied/);
    await db.exec(`reset role; delete from auth.users where id='${owner}';`);
    assert.equal((await db.query('select * from food_favorites')).rows.length, 0);
    assert.equal((await db.query('select * from diary_action_receipts')).rows.length, 0);
  } finally { await db.close(); }
});
