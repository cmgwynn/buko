import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const carol = '33333333-3333-4333-8333-333333333333';
const privateId = '44444444-4444-4444-8444-444444444444';
const migrations = new URL('../../../../supabase/migrations/', import.meta.url);
async function setup() {
  const db = new PGlite();
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
    insert into auth.users values('${alice}'),('${bob}'),('${carol}');
  `);
  for (const file of readdirSync(migrations).filter((name) => /^000[1-9]_.*\.sql$/.test(name)).sort()) {
    await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  await db.exec(`insert into recipes(id,user_id,title) values('${privateId}','${alice}','Private beans')`);
  await db.exec(`insert into community_moderators values('${carol}')`);
  return db;
}
async function rpc<T>(db: PGlite, name: string, args: unknown[] = []) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query<{ result: T }>(`select public.${name}(${placeholders}) as result`, args)).rows[0].result;
}
async function asMember<T>(db: PGlite, user: string, name: string, args: unknown[] = []) {
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`);
  try { return await rpc<T>(db, name, args); } finally { await db.exec('reset role'); }
}
async function publish(db: PGlite, recipe = privateId, score: number | null = 90, parent: string | null = null) {
  return rpc<string>(db, 'community_publish', [alice, recipe, 'Easy original beans', 'Dinner', 'Everyday', ['Vegan'],
    JSON.stringify({ title: 'Shared beans', search: 'chickpeas', servings: 1, ingredients: [], steps: [] }), score, 400, parent]);
}
describe('community database boundaries and lifecycle', () => {
  it('keeps private data separate, rejects anonymous/forged writes, and browses combined filters', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await db.exec('set role anon');
      await assert.rejects(rpc(db, 'community_browse'), /permission denied/);
      await assert.rejects(db.query('select * from community_recipes'), /permission denied/);
      await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${bob}',false)`);
      await assert.rejects(db.query(`update community_recipes set nutrition_score=100 where id='${id}'`), /permission denied/);
      await assert.rejects(publish(db), /permission denied/);
      await db.exec('reset role');
      const page = await asMember<{ total: number; rows: { id: string; review_count: number }[] }>(db, bob, 'community_browse', ['chickpeas', 'Dinner', 'Everyday', ['Vegan'], true, 'newest', 0]);
      assert.equal(page.total, 1); assert.equal(page.rows[0].id, id);
      assert.equal(page.rows[0].review_count, 0);
      const empty = await asMember<{ total: number }>(db, bob, 'community_browse', ['', 'Snack', null, [], false, 'newest', 0]);
      assert.equal(empty.total, 0);
      const detail = await asMember<{ recipe: Record<string, unknown> }>(db, bob, 'community_detail', [id]);
      assert.ok(!('private_recipe_id' in detail.recipe));
      await assert.rejects(asMember(db, alice, 'community_review', [id, 5, 'Mine']), /own/);
      await assert.rejects(asMember(db, bob, 'community_review', [id, 6, 'Invalid']), /check constraint/);
      await assert.rejects(asMember(db, bob, 'community_browse', ['', null, null, [], false, 'newest', -1]), /Invalid library/);
      await assert.rejects(asMember(db, bob, 'community_browse', [null, null, null, [], false, 'newest', 0]), /Invalid library/);
      await assert.rejects(asMember(db, bob, 'community_browse', ['', null, null, ['Certified safe'], false, 'newest', 0]), /Invalid library/);
    } finally { await db.close(); }
  });
  it('upserts one rating, ranks with review-count smoothing and excludes unknown scores from green-only results', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await asMember(db, bob, 'community_review', [id, 5, 'Added cumin']);
      await asMember(db, bob, 'community_review', [id, 4, 'Used half the cumin']);
      const page = await asMember<{ rows: { review_count: number; average_rating: number; ranking: number }[] }>(db, carol, 'community_browse', ['', null, null, [], false, 'rating', 0]);
      assert.equal(page.rows[0].review_count, 1);
      assert.equal(Number(page.rows[0].average_rating), 4);
      assert.ok(Math.abs(Number(page.rows[0].ranking) - 21.5 / 6) < 0.001);
      await db.exec(`insert into recipes(id,user_id,title) values('55555555-5555-4555-8555-555555555555','${alice}','Incomplete')`);
      await publish(db, '55555555-5555-4555-8555-555555555555', null);
      assert.equal((await asMember<{ total: number }>(db, bob, 'community_browse')).total, 2);
      assert.equal((await asMember<{ total: number }>(db, bob, 'community_browse', ['', null, null, [], true, 'newest', 0])).total, 1);
      const d = await asMember<{ myReview: { id: string } }>(db, bob, 'community_detail', [id]);
      await asMember(db, bob, 'community_remove', [d.myReview.id, 'review']);
      assert.equal((await asMember<{ reviewCount: number }>(db, bob, 'community_detail', [id])).reviewCount, 0);
    } finally { await db.close(); }
  });
  it('applies blocking in both directions to recipes, reviews, counts, and variations', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await asMember(db, bob, 'community_review', [id, 5, 'Nice']);
      await asMember(db, carol, 'community_block', [bob, true]);
      const d = await asMember<{ reviews: unknown[]; reviewCount: number }>(db, carol, 'community_detail', [id]);
      assert.equal(d.reviews.length, 0); assert.equal(d.reviewCount, 0);
      await asMember(db, bob, 'community_block', [alice, true]);
      assert.equal((await asMember<{ total: number }>(db, bob, 'community_browse')).total, 0);
      await assert.rejects(asMember(db, bob, 'community_detail', [id]), /unavailable/);
      await assert.rejects(asMember(db, bob, 'community_review', [id, 3, 'Blocked']), /unavailable/);
      await asMember(db, bob, 'community_block', [alice, false]);
      assert.equal((await asMember<{ total: number }>(db, bob, 'community_browse')).total, 1);
      await assert.rejects(asMember(db, bob, 'community_block', [bob, true]), /check constraint/);
    } finally { await db.close(); }
  });
  it('restricts moderator roles, resolves reports and prevents resurrection of removed snapshots', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await asMember(db, bob, 'community_report', [id, 'recipe', 'Incorrect dietary tags']);
      await assert.rejects(asMember(db, bob, 'community_reports_queue'), /Moderator/);
      await db.exec(`set role authenticated`);
      await assert.rejects(db.query(`insert into community_moderators values('${bob}')`), /permission denied/);
      await db.exec(`reset role`);
      const queue = await asMember<{ id: string }[]>(db, carol, 'community_reports_queue');
      assert.equal(queue.length, 1);
      await assert.rejects(asMember(db, bob, 'community_moderate', [queue[0].id, true, 'Unsafe claim']), /Moderator/);
      await asMember(db, carol, 'community_moderate', [queue[0].id, true, 'Unsafe claim']);
      assert.equal((await asMember<unknown[]>(db, carol, 'community_reports_queue')).length, 0);
      await assert.rejects(asMember(db, bob, 'community_detail', [id]), /unavailable/);
      await assert.rejects(publish(db), /unique constraint/);
      const audit = await db.query('select reason from community_moderation_log');
      assert.equal(audit.rows.length, 1);
    } finally { await db.close(); }
  });
  it('exports contributions and cascades account deletion without deleting other members private copies', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await asMember(db, bob, 'community_review', [id, 4, 'Tasty']);
      await db.query(`insert into recipes(user_id,title,community_parent_id) values($1,'My saved copy',$2)`, [bob, id]);
      const tables = await rpc<string[]>(db, 'account_export_tables');
      for (const table of ['community_recipes', 'community_reviews', 'community_blocks', 'community_reports']) assert.ok(tables.includes(table));
      const exported = await rpc<{ rows: { id: string }[] }>(db, 'account_export_page', [alice, 'community_recipes', 0, 100]);
      assert.equal(exported.rows[0].id, id);
      await db.query('delete from auth.users where id=$1', [alice]);
      assert.equal((await db.query('select * from community_recipes')).rows.length, 0);
      assert.equal((await db.query('select * from community_reviews')).rows.length, 0);
      const copy = (await db.query<{ community_parent_id: string | null }>('select community_parent_id from recipes where user_id=$1', [bob])).rows[0];
      assert.equal(copy.community_parent_id, null);
      await assert.rejects(asMember(db, alice, 'community_browse'), /Sign in/);
    } finally { await db.close(); }
  });
  it('enforces a transactional per-member daily contribution limit', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await db.query(`insert into community_requests(user_id,count) values($1,100)`, [bob]);
      await assert.rejects(asMember(db, bob, 'community_review', [id, 5, 'Too many']), /daily limit/);
      assert.equal((await db.query('select * from community_reviews')).rows.length, 0);
    } finally { await db.close(); }
  });
  it('requires an operator-designated moderator before any member content is published', async () => {
    const db = await setup();
    try {
      await db.exec('delete from community_moderators');
      await assert.rejects(publish(db), /designated moderator/);
      assert.equal((await db.query('select * from community_recipes')).rows.length, 0);
    } finally { await db.close(); }
  });
  it('links independent variations, preserves snapshots after private edits and hides removed parent content', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      const copy = (await db.query<{ id: string }>(`insert into recipes(user_id,title,community_parent_id) values($1,'My variation',$2) returning id`, [alice, id])).rows[0].id;
      const variation = await publish(db, copy, 60, id);
      await db.query(`update recipes set title='Changed in private' where id=$1`, [privateId]);
      const detail = await asMember<{ recipe: { title: string }; variations: { id: string; nutrition_score: number }[] }>(db, bob, 'community_detail', [id]);
      assert.equal(detail.recipe.title, 'Shared beans');
      assert.deepEqual(detail.variations.map((v) => [v.id, v.nutrition_score]), [[variation, 60]]);
      await asMember(db, alice, 'community_remove', [variation, 'recipe']);
      assert.equal((await asMember<{ variations: unknown[] }>(db, bob, 'community_detail', [id])).variations.length, 0);
      await db.query(`delete from recipes where id=$1`, [privateId]);
      assert.equal((await asMember<{ recipe: { title: string } }>(db, bob, 'community_detail', [id])).recipe.title, 'Shared beans');
      await asMember(db, alice, 'community_remove', [id, 'recipe']);
      await assert.rejects(asMember(db, bob, 'community_detail', [id]), /unavailable/);
    } finally { await db.close(); }
  });
  it('moderates reviews without letting the removed review be overwritten and distinguishes keep decisions', async () => {
    const db = await setup();
    try {
      const id = await publish(db);
      await asMember(db, bob, 'community_review', [id, 1, 'Reported text']);
      const detail = await asMember<{ myReview: { id: string } }>(db, bob, 'community_detail', [id]);
      await asMember(db, alice, 'community_report', [detail.myReview.id, 'review', 'Abusive review text']);
      const reports = await asMember<{ id: string }[]>(db, carol, 'community_reports_queue');
      await asMember(db, carol, 'community_moderate', [reports[0].id, true, 'Abuse removed']);
      await assert.rejects(asMember(db, bob, 'community_review', [id, 5, 'Overwrite hidden']), /removed by moderation/);
      assert.equal((await asMember<{ reviewCount: number }>(db, alice, 'community_detail', [id])).reviewCount, 0);
      await asMember(db, bob, 'community_report', [id, 'recipe', 'Needs review for tags']);
      const pending = await asMember<{ id: string }[]>(db, carol, 'community_reports_queue');
      await asMember(db, carol, 'community_moderate', [pending[0].id, false, 'Tags checked and kept']);
      assert.equal((await asMember<{ total: number }>(db, bob, 'community_browse')).total, 1);
    } finally { await db.close(); }
  });
});
