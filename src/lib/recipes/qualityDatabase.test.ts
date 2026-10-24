import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const migrations = new URL('../../../supabase/migrations/', import.meta.url);
const recipe = {
  title: 'Tested beans', servings: 2, prepMinutes: 5, cookMinutes: 10, cuisine: 'Everyday',
  mealTypes: ['dinner'], dietTags: ['vegan'],
  ingredients: [{
    position: 0, raw_text: '200g beans', quantity: 200, unit: 'g', name: 'Beans', grams: 200,
    food_source: 'manual', food_source_id: null,
    nutrition: { per100g: { calories: 100, protein: 10, carbs: 15, fat: 1, sugars: 1, saturatedFat: 0, sodiumMg: 10, fiber: 5 } },
    section: 'pantry', match_status: 'manual',
  }],
  steps: [{ position: 0, text: 'Simmer beans until tender.', timer_seconds: 600 }],
};
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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
    insert into auth.users values('${owner}'),('${other}');
  `);
  try {
    for (const file of readdirSync(migrations).filter((name) => /^00(?:0[1-9]|1[0-4])_.*\.sql$/.test(name)).sort()) {
      await db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    await db.exec(`
      grant select,insert,update,delete on recipes,recipe_ingredients,recipe_steps to authenticated;
      insert into recipe_admins(user_id) values('${owner}');
    `);
    return db;
  } catch (error) { await db.close(); throw error; }
}
async function as(db: PGlite, role = 'authenticated', user = owner) {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${user}',false)`);
}
async function value<T>(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(`select ${sql} as value`, params)).rows[0].value;
}
async function draft(db: PGlite, snapshot: object = recipe, base: string | null = null, notes = 'Original recipe; owner grants Buko permission to use and adapt.') {
  return value<string>(db, 'recipe_quality_create_draft($1,$2,$3,$4)', [JSON.stringify(snapshot), base, '{}', notes]);
}
async function approve(db: PGlite, version: string) {
  await value(db, 'recipe_quality_record_test($1,5,true,15,$2)', [version, 'Cooked as written; good texture.']);
  await value(db, 'recipe_quality_approve($1)', [version]);
}
function publication(version: string | null, snapshot = recipe, disposition = 'tested') {
  return { baseVersionId: version, recipe: snapshot, disposition, attempts: [], reviewNote: 'Checked against the base.',
    changes: [], promptVersion: 'recipe-quality-v1' };
}
async function publish(db: PGlite, version: string | null, request: string, snapshot = recipe, disposition = 'tested', user = owner) {
  return value<string>(db, 'recipe_quality_publish($1,$2,$3)', [user, JSON.stringify(publication(version, snapshot, disposition)), request]);
}

test('quality migration restricts administration, human approval, immutable versions and private source notes', async () => {
  const db = await setup();
  try {
    await as(db, 'authenticated', other);
    assert.equal(await value(db, 'recipe_quality_is_admin()'), false);
    for (const sql of ['recipe_quality_admin_list()', 'recipe_quality_flags()', "recipe_quality_create_draft('{}')"]) {
      await assert.rejects(value(db, sql), /Recipe admin required/);
    }
    for (const table of ['recipe_admins', 'recipe_versions', 'recipe_quality_tests', 'recipe_taste_feedback']) {
      await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    }
    await assert.rejects(db.query('insert into recipe_admins(user_id) values($1)', [other]), /permission denied/);
    await assert.rejects(publish(db, null, uuid(1)), /permission denied/);
    await as(db);
    assert.equal(await value(db, 'recipe_quality_is_admin()'), true);
    assert.deepEqual(await value(db, 'recipe_quality_approved()'), []);
    const version = await draft(db);
    await assert.rejects(value(db, 'recipe_quality_approve($1)', [version]), /positive human/);
    await value(db, 'recipe_quality_record_test($1,2,false,20,$2)', [version, 'Too dry.']);
    await assert.rejects(value(db, 'recipe_quality_approve($1)', [version]), /positive human/);
    await assert.rejects(value(db, 'recipe_quality_record_test($1,6,true,20,$2)', [version, 'Bad rating']), /rating/);
    await approve(db, version);
    const rows = await value<Array<Record<string, unknown>>>(db, 'recipe_quality_admin_list()');
    assert.equal(rows[0].status, 'approved');
    assert.equal((rows[0].tests as unknown[]).length, 2);
    assert.equal(rows[0].source_notes, 'Original recipe; owner grants Buko permission to use and adapt.');
    assert.deepEqual(rows[0].recipe, recipe);
    assert.deepEqual(rows[0].adaptation_policy, { allowedProteinSwaps: [], allowedDietarySwaps: [], maxSubstitutions: 2 });
    const base = rows[0].base_recipe_id as string;
    const next = await draft(db, { ...recipe, title: 'New version' }, base);
    assert.notEqual(next, version);
    const versions = await value<Array<{ version: number; status: string }>>(db, 'recipe_quality_admin_list()');
    assert.deepEqual(versions.map((row) => [row.version, row.status]), [[1, 'approved'], [2, 'draft']]);
    await assert.rejects(value(db, 'recipe_quality_record_test($1,5,true,15,$2)', [version, 'Cannot mutate']), /new version/);
    const missingPermission = await draft(db, recipe, null, '');
    await value(db, 'recipe_quality_record_test($1,5,true,15,$2)', [missingPermission, 'Good']);
    await assert.rejects(value(db, 'recipe_quality_approve($1)', [missingPermission]), /permission notes/);
    const incomplete = await draft(db, { ...recipe, ingredients: [] });
    await value(db, 'recipe_quality_record_test($1,5,true,15,$2)', [incomplete, 'Good']);
    await assert.rejects(value(db, 'recipe_quality_approve($1)', [incomplete]), /incomplete/);
    await assert.rejects(value(db, 'recipe_quality_create_draft($1,null,$2)', [JSON.stringify(recipe), '{"maxSubstitutions":3}']), /at most two/);
    await as(db, 'authenticated', other);
    const approved = await value<Array<{ id: string; source_notes: string; tests: unknown[] }>>(db, 'recipe_quality_approved()');
    assert.equal(approved.length, 1);
    assert.equal(approved[0].id, version);
    assert.equal(approved[0].source_notes, '');
    assert.deepEqual(approved[0].tests, []);
    await assert.rejects(value(db, 'recipe_quality_archive($1,true)', [base]), /admin/);
    await as(db);
    await value(db, 'recipe_quality_archive($1,true)', [base]);
    assert.deepEqual(await value(db, 'recipe_quality_approved()'), []);
    const paused = await value<Array<{ base_recipe_id: string; archived_at: string | null }>>(db, 'recipe_quality_admin_list()');
    assert.ok(paused.filter((row) => row.base_recipe_id === base).every((row) => row.archived_at !== null));
    await as(db, 'service_role');
    await assert.rejects(publish(db, version, uuid(99)), /approved/);
    await as(db);
    await value(db, 'recipe_quality_archive($1,false)', [base]);
    assert.equal((await value<unknown[]>(db, 'recipe_quality_approved()')).length, 1);
    await as(db, 'anon');
    await assert.rejects(value(db, 'recipe_quality_approved()'), /permission denied/);
    await as(db, 'postgres');
    await assert.rejects(db.query("update recipe_versions set recipe='{}' where id=$1", [version]), /immutable/);
    await assert.rejects(db.query("update recipe_versions set status='approved' where id=$1", [next]), /status transition/);
    await assert.rejects(db.query("update recipe_versions set status='approved' where id=$1", [incomplete]), /incomplete/);
    // Even if a deployment's broad default grants are reapplied, RLS keeps all quality tables closed.
    await db.exec('grant select,insert,update,delete on recipe_admins,recipe_versions,recipe_taste_profiles to authenticated');
    await as(db);
    assert.equal((await db.query('select * from recipe_versions')).rows.length, 0);
    await assert.rejects(db.query('insert into recipe_admins(user_id) values($1)', [other]), /row-level security/);
    assert.equal(await value(db, 'recipe_quality_is_admin()'), true);
  } finally { await db.close(); }
});

test('publication is atomic, service-only, owner-idempotent and provenance detects every content edit', async () => {
  const db = await setup();
  try {
    await as(db);
    const version = await draft(db);
    await approve(db, version);
    const unapproved = await draft(db);
    await as(db, 'service_role');
    await assert.rejects(publish(db, unapproved, uuid(1)), /approved/);
    await assert.rejects(publish(db, version, uuid(1), { ...recipe, title: 'Different' }), /exactly match/);
    const bad = publication(version);
    bad.promptVersion = '';
    await assert.rejects(value(db, 'recipe_quality_publish($1,$2,$3)', [owner, JSON.stringify(bad), uuid(1)]), /prompt_version/);
    await assert.rejects(value(db, 'recipe_quality_publish($1,$2,$3)', [owner,
      JSON.stringify({ ...publication(version), attempts: [{ reasoning: 'Do not store hidden reasoning.' }] }), uuid(1)]), /review attempts/);
    await as(db, 'postgres');
    assert.equal(await value(db, '(select count(*)::int from recipes)'), 0);
    assert.equal(await value(db, '(select count(*)::int from recipe_ingredients)'), 0);
    await as(db, 'service_role');
    const id = await publish(db, version, uuid(1));
    assert.equal(await publish(db, version, uuid(1), { ...recipe, title: 'Ignored replay' }), id);
    const otherId = await publish(db, version, uuid(1), recipe, 'tested', other);
    assert.notEqual(id, otherId);
    await as(db);
    assert.deepEqual(await value(db, 'recipe_quality_result($1)', [uuid(1)]),
      { recipeId: id, disposition: 'tested', note: 'Checked against the base.' });
    assert.equal(await value(db, 'recipe_quality_result($1)', [uuid(100)]), null);
    assert.deepEqual(await value(db, 'recipe_quality_provenance($1)', [id]),
      { label: 'Tested', baseTitle: recipe.title, note: 'Checked against the base.' });
    await assert.rejects(value(db, 'recipe_quality_provenance($1)', [otherId]), /unavailable/);
    await assert.rejects(db.query('update recipes set quality_fingerprint=$1 where id=$2', ['spoof', id]), /server managed/);
    await assert.rejects(db.query('insert into recipes(user_id,title,base_recipe_version_id) values($1,$2,$3)', [owner, 'Spoof', version]), /server managed/);
    const edits = [
      ['recipes', 'title', 'Edited'],
      ['recipes', 'servings', 3],
      ['recipes', 'prep_minutes', 6],
      ['recipes', 'cuisine', 'Italian'],
      ['recipe_ingredients', 'name', 'Rice'],
      ['recipe_ingredients', 'grams', 300],
      ['recipe_ingredients', 'nutrition', JSON.stringify({ per100g: { calories: 999 } })],
      ['recipe_steps', 'text', 'Do something else.'],
      ['recipe_steps', 'timer_seconds', 20],
    ] as const;
    for (const [table, column, changed] of edits) {
      await db.exec('begin');
      await db.query(`update ${table} set ${column}=$1 where ${table === 'recipes' ? 'id' : 'recipe_id'}=$2`, [changed, id]);
      assert.equal((await value<{ label: string | null }>(db, 'recipe_quality_provenance($1)', [id])).label, null, `${table}.${column}`);
      await db.exec('rollback');
    }
    await db.query("update recipes set source_name='Personal annotation' where id=$1", [id]);
    assert.equal((await value<{ label: string }>(db, 'recipe_quality_provenance($1)', [id])).label, 'Tested');
    await value(db, 'save_private_recipe($1,$2,$3)', [
      JSON.stringify({ id, title: 'Changed by old RPC', servings: 2, prep_minutes: 5, cook_minutes: 10, expected_user_id: owner,
        quality_fingerprint: 'spoof', base_recipe_version_id: version }),
      JSON.stringify(recipe.ingredients), JSON.stringify(recipe.steps),
    ]);
    assert.equal((await value<{ label: null }>(db, 'recipe_quality_provenance($1)', [id])).label, null);
    await as(db, 'service_role');
    const adapted = await publish(db, version, uuid(2), { ...recipe, title: 'Adapted beans' }, 'adapted');
    const fallback = await publish(db, null, uuid(3), recipe, 'fallback');
    const withReview = {
      ...publication(version, { ...recipe, title: 'Reviewed adaptation' }, 'adapted'),
      attempts: [{
        attempt: 1, stage: 'review', outcome: 'accepted', promptVersion: 'recipe-quality-v1',
        issues: [{ category: 'seasoning', severity: 'warning', detail: 'Taste before adding salt.' }],
      }],
      changes: [{ path: 'title', reason: 'Identifies the variation.' }],
    };
    const reviewed = await value<string>(db, 'recipe_quality_publish($1,$2,$3)', [owner, JSON.stringify(withReview), uuid(4)]);
    // Numeric JSON scales can differ after SQL integer coercion; the stored canonical fingerprint remains readable.
    const decimalJSON = JSON.stringify(publication(version)).replace('"prepMinutes":5,', '"prepMinutes":5.0,');
    const decimal = await value<string>(db, 'recipe_quality_publish($1,$2,$3)', [owner, decimalJSON, uuid(5)]);
    await as(db);
    assert.equal((await value<{ label: string }>(db, 'recipe_quality_provenance($1)', [adapted])).label, 'Adapted');
    assert.equal((await value<{ label: null }>(db, 'recipe_quality_provenance($1)', [fallback])).label, null);
    assert.equal((await value<{ label: string }>(db, 'recipe_quality_provenance($1)', [reviewed])).label, 'Adapted');
    assert.equal((await value<{ label: string }>(db, 'recipe_quality_provenance($1)', [decimal])).label, 'Tested');
  } finally { await db.close(); }
});

test('taste data is private, deduplicated, exportable, cascading and aggregates distinct people at privacy threshold', async () => {
  const db = await setup();
  try {
    await as(db);
    const version = await draft(db);
    await approve(db, version);
    const profile = await value<{ preferences: Record<string, unknown>; learned: { feedbackCount: number } }>(db, 'recipe_quality_taste_profile()');
    assert.equal(profile.preferences.aiConsentVersion, null);
    assert.deepEqual(profile.preferences.preferredCuisines, []);
    assert.equal(profile.learned.feedbackCount, 0);
    await value(db, 'recipe_quality_save_taste_profile($1)', [JSON.stringify({
      preferredCuisines: ['Everyday'], spiceTolerance: 'mild', dislikedIngredients: ['olives'], maxCookMinutes: 30, aiConsentVersion: 'recipe-quality-v1',
    })]);
    await assert.rejects(value(db, 'recipe_quality_save_taste_profile($1)', ['{"aiConsentVersion":"coach-v1"}']), /consent/);
    await assert.rejects(value(db, 'recipe_quality_save_taste_profile($1)', ['{"maxCookMinutes":-1}']), /cook time/);
    const feedback = (id: string, event: string, thumb = false) => value(db, 'recipe_quality_feedback($1,$2,$3,false,$4,15,$5,$6)',
      [id, event, thumb, ['bland'], 'too mild', ['olives']]);
    await as(db, 'service_role');
    const id = await publish(db, version, uuid(1));
    await as(db);
    await feedback(id, uuid(2));
    await feedback(id, uuid(2), true);
    const learned = await value<{ learned: { feedbackCount: number; thumbsDown: number; tagCounts: object } }>(db, 'recipe_quality_taste_profile()');
    assert.equal(learned.learned.feedbackCount, 1);
    assert.equal(learned.learned.thumbsDown, 1);
    assert.deepEqual(learned.learned.tagCounts, { bland: 1 });
    await value(db, 'recipe_quality_reset_taste_learning()');
    assert.equal((await value<typeof learned>(db, 'recipe_quality_taste_profile()')).learned.feedbackCount, 0);
    assert.equal((await value<typeof profile>(db, 'recipe_quality_taste_profile()')).preferences.aiConsentVersion, 'recipe-quality-v1');
    assert.deepEqual(await value(db, 'recipe_quality_flags()'), []);
    await as(db, 'authenticated', other);
    await assert.rejects(feedback(id, uuid(3)), /unavailable/);
    assert.equal((await value<typeof profile>(db, 'recipe_quality_taste_profile()')).learned.feedbackCount, 0);
    await assert.rejects(value(db, 'recipe_quality_flags()'), /admin/);
    // Multiple events by one person cannot meet the ten-distinct-person threshold.
    await as(db);
    for (let i = 10; i < 22; i++) await feedback(id, uuid(i));
    assert.deepEqual(await value(db, 'recipe_quality_flags()'), []);
    await value(db, 'recipe_quality_feedback($1,$2,null,null,$3,0,$4,$5)',
      [id, uuid(4), ['family loved it'], 'just right', []]);
    await as(db, 'service_role');
    const ownerAdapted = await publish(db, version, uuid(5), { ...recipe, title: 'Adapted beans' }, 'adapted');
    await as(db);
    await feedback(ownerAdapted, uuid(6));
    for (let i = 1; i <= 9; i++) {
      const user = uuid(100 + i);
      await as(db, 'postgres');
      await db.query('insert into auth.users values($1)', [user]);
      await as(db, 'service_role');
      const saved = await publish(db, version, uuid(1), recipe, 'tested', user);
      await as(db, 'authenticated', user);
      await feedback(saved, uuid(2), i > 3);
      await as(db, 'service_role');
      const adapted = await publish(db, version, uuid(5), { ...recipe, title: 'Adapted beans' }, 'adapted', user);
      await as(db, 'authenticated', user);
      await feedback(adapted, uuid(6), i > 3);
    }
    await as(db);
    const flags = await value<Array<{ distinct_users: number; thumbs_down: number; flagged: boolean; disposition: string }>>(db, 'recipe_quality_flags()');
    assert.equal(flags.length, 2);
    const testedFlag = flags.find((flag) => flag.disposition === 'tested')!;
    const adaptedFlag = flags.find((flag) => flag.disposition === 'adapted')!;
    assert.equal(testedFlag.distinct_users, 10);
    assert.equal(testedFlag.thumbs_down, 4);
    assert.equal(testedFlag.flagged, true);
    assert.equal(adaptedFlag.distinct_users, 10);
    assert.equal(adaptedFlag.flagged, true);
    assert.ok(!JSON.stringify(flags).includes(owner));
    await feedback(ownerAdapted, uuid(7), true);
    const improved = await value<Array<{ disposition: string }>>(db, 'recipe_quality_flags()');
    assert.deepEqual(improved.map((flag) => flag.disposition), ['tested']);
    await value(db, 'recipe_quality_reset_taste_learning()');
    assert.equal((await value<typeof profile>(db, 'recipe_quality_taste_profile()')).learned.feedbackCount, 0);
    assert.deepEqual(await value(db, 'recipe_quality_flags()'), improved);
    await as(db, 'service_role');
    const inventory = await value<string[]>(db, 'account_export_tables()');
    for (const table of ['recipe_taste_profiles', 'recipe_taste_feedback', 'recipe_adaptations', 'recipe_quality_tests', 'recipe_quality_requests']) {
      assert.ok(inventory.includes(table), table);
    }
    const exported = await value<{ total: number; rows: Array<{ user_id: string }> }>(db, 'account_export_page($1,$2,0,500)', [owner, 'recipe_taste_feedback']);
    assert.equal(exported.total, 16);
    assert.ok(exported.rows.every((row) => row.user_id === owner));
    await as(db, 'postgres');
    await db.query('delete from auth.users where id=$1', [owner]);
    for (const table of ['recipe_taste_profiles', 'recipe_taste_feedback', 'recipe_adaptations', 'recipe_quality_requests', 'recipe_admins']) {
      assert.equal(await value(db, `(select count(*)::int from ${table} where user_id=$1)`, [owner]), 0);
    }
    assert.equal(await value(db, '(select status from recipe_versions where id=$1)', [version]), 'approved');
    assert.equal(await value(db, '(select user_id from recipe_versions where id=$1)', [version]), null);
  } finally { await db.close(); }
});

test('AI reservations enforce explicit recipe consent, service ACLs, durable receipts and shared budgets', async () => {
  const db = await setup();
  try {
    const reserve = (request: string, limit = 100, kind = 'adapt', attempt = 1, user = owner) =>
      value<boolean>(db, 'recipe_quality_reserve($1,$2,$3,$4,$5)', [user, request, limit, kind, attempt]);
    await as(db);
    await assert.rejects(reserve(uuid(1)), /permission denied/);
    await as(db, 'service_role');
    await assert.rejects(reserve(uuid(1)), /consent/);
    await as(db);
    await value(db, 'recipe_quality_save_taste_profile($1)', ['{"aiConsentVersion":"recipe-quality-v1"}']);
    await as(db, 'service_role');
    assert.equal(await reserve(uuid(1)), true);
    assert.equal(await reserve(uuid(1)), false);
    assert.equal(await reserve(uuid(1), 100, 'review'), true);
    assert.equal(await reserve(uuid(1), 100, 'adapt', 2), true);
    assert.equal(await reserve(uuid(1), 100, 'review', 2), true);
    assert.equal(await reserve(uuid(2)), true);
    assert.equal(await reserve(uuid(3)), false);
    await as(db, 'postgres');
    await db.exec("update recipe_quality_requests set created_at=now()-interval '2 minutes'");
    await as(db, 'service_role');
    assert.equal(await reserve(uuid(3), 5), false);
    await as(db, 'authenticated', other);
    await value(db, 'recipe_quality_save_taste_profile($1)', ['{"aiConsentVersion":"recipe-quality-v1"}']);
    await as(db, 'service_role');
    assert.equal(await reserve(uuid(3), 5, 'adapt', 1, other), false);
    for (let i = 0; i < 3; i++) {
      for (let n = 0; n < 5; n++) assert.equal(await reserve(uuid(10 + i * 5 + n)), true);
      await as(db, 'postgres');
      await db.exec("update recipe_quality_requests set created_at=now()-interval '2 minutes'");
      await as(db, 'service_role');
    }
    assert.equal(await reserve(uuid(99)), false);
    await as(db);
    await value(db, 'recipe_quality_save_taste_profile($1)', ['{"aiConsentVersion":null}']);
    await as(db, 'service_role');
    await assert.rejects(reserve(uuid(100)), /consent/);
  } finally { await db.close(); }
});

test('same-request claims serialize concurrent callers, expire recoverably and preserve completed results', async () => {
  const db = await setup();
  try {
    await as(db);
    const version = await draft(db);
    await approve(db, version);
    let user = owner;
    const claim = () => value<boolean>(db, 'recipe_quality_claim($1,$2)', [user, uuid(600)]);
    await assert.rejects(claim(), /permission denied/);
    await as(db, 'service_role');
    const outcomes = await Promise.all([claim(), claim()]);
    assert.deepEqual(outcomes.sort(), [false, true]);
    assert.equal(await claim(), false);
    user = other;
    assert.equal(await claim(), true);
    user = owner;
    await as(db, 'postgres');
    await db.query("update recipe_quality_claims set leased_until=clock_timestamp()-interval '1 second' where user_id=$1", [owner]);
    await as(db, 'service_role');
    assert.equal(await claim(), true);
    assert.equal(await claim(), false);
    const id = await publish(db, version, uuid(600));
    assert.equal(await claim(), false);
    await as(db);
    assert.equal((await value<{ recipeId: string }>(db, 'recipe_quality_result($1)', [uuid(600)])).recipeId, id);
    await as(db, 'anon');
    await assert.rejects(claim(), /permission denied/);
    await as(db, 'service_role');
    assert.ok((await value<string[]>(db, 'account_export_tables()')).includes('recipe_quality_claims'));
    await as(db, 'postgres');
    await db.query('delete from auth.users where id=$1', [owner]);
    assert.equal(await value(db, '(select count(*)::int from recipe_quality_claims where user_id=$1)', [owner]), 0);
  } finally { await db.close(); }
});
