import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const migrations = new URL('../../../../supabase/migrations/', import.meta.url);

test('workflow RPCs enforce ownership and atomically replace recipes and generated lists', async () => {
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
    for (const file of readdirSync(migrations).filter((file) => /^00(?:0[1-9]|10)_.*\.sql$/.test(file)).sort()) {
      await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    await db.exec(`grant select,insert,update,delete on recipes,recipe_ingredients,recipe_steps,grocery_items to authenticated;
      set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
    const recipe = { title: 'Beans', servings: 2, prep_minutes: 5, cook_minutes: 10, expected_user_id: owner };
    const ingredient = { raw_text: '200g beans', name: 'Beans', grams: 200, section: 'pantry', match_status: 'unmatched' };
    const step = { text: 'Cook beans.', timer_seconds: 60 };
    const save = async (row: object, ingredients = [ingredient], steps = [step]) =>
      (await db.query<{ id: string }>('select save_private_recipe($1,$2,$3) as id', [JSON.stringify(row), JSON.stringify(ingredients), JSON.stringify(steps)])).rows[0].id;
    const id = await save(recipe);
    assert.ok(id);
    assert.equal((await db.query('select * from recipe_ingredients')).rows.length, 1);
    await assert.rejects(save({ ...recipe, id, title: 'Should roll back' }, [{ ...ingredient, section: 'bad' }]), /section/);
    assert.equal((await db.query<{ title: string }>('select title from recipes where id=$1', [id])).rows[0].title, 'Beans');
    assert.equal((await db.query('select * from recipe_ingredients')).rows.length, 1);
    await assert.rejects(save({ ...recipe, id }, [ingredient], [{ ...step, timer_seconds: -1 }]), /timer_seconds/);
    assert.equal((await db.query('select * from recipe_steps')).rows.length, 1);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    await assert.rejects(save({ ...recipe, id }), /account changed/);
    await assert.rejects(save({ ...recipe, id, expected_user_id: other }), /unavailable/);
    await db.exec(`select set_config('request.jwt.claim.sub','${owner}',false)`);
    const groceries = [{ name: 'Beans', quantity: '1 can', section: 'pantry', from_recipes: ['Beans'] }];
    const generate = (items: object[], expected = owner) => db.query('select replace_generated_groceries($1,$2,$3)', ['2026-10-26', JSON.stringify(items), expected]);
    await db.exec(`insert into grocery_items(user_id,name,source) values('${owner}','Manual apple','manual');
      insert into grocery_items(user_id,name,source,generated_week,checked) values('${owner}','Checked rice','plan','2026-10-26',true);`);
    await generate(groceries);
    await assert.rejects(generate([{ ...groceries[0], section: 'bad' }]), /section/);
    assert.equal((await db.query('select * from grocery_items')).rows.length, 3);
    assert.equal((await db.query("select * from grocery_items where name='Beans'")).rows.length, 1);
    await generate([{ ...groceries[0], name: 'Lentils' }]);
    assert.equal((await db.query('select * from grocery_items')).rows.length, 3);
    assert.equal((await db.query("select * from grocery_items where name='Beans'")).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    await assert.rejects(generate(groceries), /account changed/);
    await generate(groceries, other);
    assert.equal((await db.query('select * from grocery_items')).rows.length, 1);
    await db.exec(`reset role; set role anon;`);
    await assert.rejects(generate(groceries), /permission denied/);
  } finally { await db.close(); }
});
