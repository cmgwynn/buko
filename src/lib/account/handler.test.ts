import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountError, createAccountHandler, type AccountStore, type DataPage } from '../../../supabase/functions/account/handler';

const userId = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const now = 1800000000000;
function fixture() {
  const events: string[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    profiles: [{ user_id: userId, birth_date: '1990-01-01' }],
    recipe_ingredients: Array.from({ length: 5 }, (_, id) => ({ user_id: userId, id, raw_text: `Ingredient ${id}` })),
    recipe_steps: [{ user_id: userId, id: 1, text: 'Mix' }],
    workout_exercises: [{ user_id: userId, id: 1 }],
    workout_sets: [{ user_id: userId, id: 1, reps: 10 }],
    user_settings: [{ user_id: userId, health_read_steps: true }],
    coach_replies: [{ user_id: userId, id: 1, text: 'Reply' }],
    coach_actions: [{ user_id: userId, id: 1 }],
    coach_days: [{ user_id: userId, day: '2026-10-24' }],
    coach_target_snapshots: [{ user_id: userId, day: '2026-10-24', calories: 2000 }],
    coach_usage: [{ user_id: userId, day_count: 1 }],
    subscription_access: [{ user_id: userId, expires_at: '2027-01-01' }],
    billing_usage: [{ user_id: userId, count: 2 }],
    diagnostic_usage: [{ user_id: userId, count: 2 }],
  };
  const photos: Record<string, unknown>[] = Array.from({ length: 5 }, (_, n) => ({ name: `${userId}/nested/${n}.jpg` }));
  function page(rows: Record<string, unknown>[], offset: number, limit: number): DataPage {
    return { rows: rows.slice(offset, offset + limit), total: rows.length, revision: JSON.stringify(rows) };
  }
  const store: AccountStore = {
    userId, user: { id: userId, email: 'test@example.com' }, authenticatedAt: now / 1000,
    tables: async () => Object.keys(tables).sort(),
    page: async (table, offset, limit) => { events.push(`page:${table}:${offset}`); return page(tables[table], offset, limit); },
    photos: async (offset, limit) => { events.push(`photos:${offset}`); return page(photos, offset, limit); },
    downloadPhoto: async (path) => {
      events.push(`download:${path}`);
      return new Response(new Uint8Array([137, 80, 78, 71, 0, 255]), { headers: { 'Content-Type': 'image/png', Authorization: 'PRIVATE STORAGE SECRET' } });
    },
    removePhotos: async (paths) => {
      events.push(`remove:${paths.length}`);
      for (const path of paths) photos.splice(photos.findIndex((row) => row.name === path), 1);
    },
    deleteSubscriber: async () => { events.push('subscriber'); return 'deleted'; },
    deleteAuth: async () => { events.push('auth'); },
  };
  let authenticated = 0;
  const dependencies = {
    now: () => now, pageSize: 2,
    authenticate: async (token: string) => {
      authenticated++;
      if (token !== 'verified-token') throw new AccountError('Invalid session.', 401, 'UNAUTHORIZED');
      return store;
    },
  };
  const handler = createAccountHandler(dependencies);
  function request(body: unknown = { action: 'export' }, token: string | null = 'verified-token') {
    return new Request('https://example.com/account', {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
    });
  }
  return { handler, dependencies, request, store, events, tables, photos, authenticated: () => authenticated };
}

describe('authenticated account handler', () => {
  it('rejects missing or unverified authentication before any data access', async () => {
    const f = fixture();
    assert.equal((await f.handler(f.request(undefined, null))).status, 401);
    assert.equal(f.authenticated(), 0);
    assert.equal((await f.handler(f.request(undefined, 'forged'))).status, 401);
    assert.deepEqual(f.events, []);
  });
  it('supports CORS preflight and rejects other methods', async () => {
    const f = fixture();
    const preflight = await f.handler(new Request('https://example.com', { method: 'OPTIONS' }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
    assert.equal((await f.handler(new Request('https://example.com'))).status, 405);
    assert.equal(f.authenticated(), 0);
  });
  it('requires actual recent authentication, not a refreshed token', async () => {
    const f = fixture();
    for (const timestamp of [now / 1000 - 601, NaN, now / 1000 + 61]) {
      f.store.authenticatedAt = timestamp;
      const result = await f.handler(f.request());
      assert.equal(result.status, 401);
      assert.equal((await result.json()).code, 'REAUTH_REQUIRED');
    }
    assert.deepEqual(f.events, []);
  });
  it('validates JSON, action and exact DELETE confirmation without mutations', async () => {
    const f = fixture();
    for (const body of [null, {}, { action: 'anything' }, { action: 'delete', confirmation: 'delete' }]) {
      assert.equal((await f.handler(f.request(body))).status, 400);
    }
    assert.equal((await f.handler(new Request('https://example.com', {
      method: 'POST', headers: { Authorization: 'Bearer verified-token' }, body: '{bad',
    }))).status, 400);
    assert.deepEqual(f.events, []);
  });
  it('exports every table, child row, server-only usage, future billing data and every photo without truncation', async () => {
    const f = fixture();
    const response = await f.handler(f.request({ action: 'export', userId: other }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const result = await response.json();
    assert.deepEqual(result.data, f.tables);
    assert.equal(result.account.id, userId);
    assert.equal(result.assets.length, 5);
    for (const asset of result.assets) {
      assert.ok(asset.path.startsWith(`${userId}/`));
      assert.equal(asset.contentType, 'image/png');
      assert.equal(asset.encoding, 'base64');
      assert.equal(asset.byteLength, 6);
      assert.deepEqual([...Buffer.from(asset.base64, 'base64')], [137, 80, 78, 71, 0, 255]);
      assert.equal(asset.download_url, undefined);
    }
    assert.ok(!JSON.stringify(result).includes('PRIVATE STORAGE SECRET'));
    assert.ok(!JSON.stringify(result).includes('verified-token'));
    assert.ok(f.events.includes('page:recipe_ingredients:4'));
    assert.ok(f.events.includes('photos:4'));
    assert.equal(f.events.filter((e) => e.startsWith('download:')).length, 5);
    assert.ok(!f.events.includes('auth'));
  });
  it('never returns another user’s rows or downloads another user’s photos', async () => {
    const f = fixture();
    f.tables.recipe_steps[0].user_id = other;
    assert.equal((await f.handler(f.request())).status, 409);
    f.tables.recipe_steps[0].user_id = userId;
    f.photos[0].name = `${other}/photo.jpg`;
    assert.equal((await f.handler(f.request())).status, 409);
    assert.ok(!f.events.some((e) => e.startsWith('download:')));
  });
  it('fails explicitly rather than returning a truncated oversized export', async () => {
    const f = fixture();
    for (const limits of [{ maxRows: 2 }, { maxBytes: 10 }, { maxPhotos: 2 }]) {
      const handler = createAccountHandler({ ...f.dependencies, ...limits });
      const response = await handler(f.request());
      assert.equal(response.status, 413);
      const body = await response.json();
      assert.equal(body.code, 'EXPORT_TOO_LARGE');
      assert.equal(body.data, undefined);
    }
  });
  it('bounds incoming request bytes before decoding JSON', async () => {
    const f = fixture();
    const response = await f.handler(f.request({ action: 'export', padding: 'a'.repeat(2000) }));
    assert.equal(response.status, 413);
    assert.deepEqual(f.events, []);
  });
  it('fails closed on missing pages and changed same-count content', async () => {
    const f = fixture();
    const original = f.store.page;
    f.store.page = async (table, offset, limit) => {
      const page = await original(table, offset, limit);
      return table === 'recipe_ingredients' && offset > 0 ? { ...page, rows: [] } : page;
    };
    assert.equal((await f.handler(f.request())).status, 503);
    f.store.page = async (table, offset, limit) => {
      const page = await original(table, offset, limit);
      return table === 'recipe_ingredients' && offset > 0 ? { ...page, revision: 'changed' } : page;
    };
    assert.equal((await f.handler(f.request())).status, 409);
  });
  it('detects changes to already exported tables during the final verification', async () => {
    const f = fixture();
    const original = f.store.photos;
    f.store.photos = async (offset, limit) => {
      f.tables.profiles[0].birth_date = '1991-01-01';
      return original(offset, limit);
    };
    assert.equal((await f.handler(f.request())).status, 409);
  });
  it('does not produce a successful export if downloading any asset fails', async () => {
    const f = fixture();
    f.store.downloadPhoto = async () => { throw new Error('PRIVATE SERVICE SECRET'); };
    const response = await f.handler(f.request());
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('PRIVATE'));
  });
  it('fails the entire export if any photo download returns an error or invalid content', async () => {
    const f = fixture();
    for (const response of [
      new Response('PRIVATE STORAGE ERROR', { status: 403 }),
      new Response('not an image', { headers: { 'Content-Type': 'text/plain' } }),
      new Response(new Uint8Array(), { headers: { 'Content-Type': 'image/jpeg' } }),
    ]) {
      f.store.downloadPhoto = async () => response;
      const result = await f.handler(f.request());
      assert.equal(result.status, 503);
      const body = await result.json();
      assert.equal(body.code, 'PHOTO_DOWNLOAD_FAILED');
      assert.equal(body.assets, undefined);
      assert.ok(!JSON.stringify(body).includes('PRIVATE STORAGE ERROR'));
    }
  });
  it('fails explicitly if a photo exceeds its byte cap or the remaining total JSON budget', async () => {
    const f = fixture();
    f.store.downloadPhoto = async () => new Response(new Uint8Array([1]), {
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(5 * 1024 * 1024 + 1) },
    });
    let result = await f.handler(f.request());
    assert.equal(result.status, 413);
    assert.equal((await result.json()).code, 'EXPORT_TOO_LARGE');
    f.store.downloadPhoto = async () => new Response(new Uint8Array(4000), { headers: { 'Content-Type': 'image/png' } });
    result = await createAccountHandler({ ...f.dependencies, maxBytes: 9000 })(f.request());
    assert.equal(result.status, 413);
    assert.equal((await result.json()).code, 'EXPORT_TOO_LARGE');
  });
  it('drains storage page zero before external subscriber and permanent auth deletion', async () => {
    const f = fixture();
    const response = await f.handler(f.request({ action: 'delete', confirmation: 'DELETE', userId: other }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.deleted, true);
    assert.equal(body.photosRemoved, 5);
    assert.deepEqual(f.events, ['photos:0', 'remove:2', 'photos:0', 'remove:2', 'photos:0', 'remove:1', 'photos:0', 'subscriber', 'auth']);
    assert.ok(body.retention.some((note: string) => note.includes('does not cancel')));
  });
  it('reports partial photo deletion and safely resumes on retry', async () => {
    const f = fixture();
    const remove = f.store.removePhotos;
    let calls = 0;
    f.store.removePhotos = async (paths) => {
      if (++calls === 2) throw new Error('SECRET');
      await remove(paths);
    };
    const first = await f.handler(f.request({ action: 'delete', confirmation: 'DELETE' }));
    assert.equal(first.status, 503);
    const body = await first.json();
    assert.equal(body.stage, 'storage');
    assert.equal(body.photosRemoved, 2);
    assert.equal(body.retryable, true);
    assert.ok(!body.error.includes('SECRET'));
    assert.ok(!f.events.includes('auth'));
    assert.ok(!f.events.includes('subscriber'));
    const retry = await f.handler(f.request({ action: 'delete', confirmation: 'DELETE' }));
    assert.equal(retry.status, 200);
    assert.equal(f.photos.length, 0);
  });
  it('stops before auth deletion when external subscriber removal fails', async () => {
    const f = fixture();
    f.store.deleteSubscriber = async () => { throw new Error('Provider secret'); };
    const response = await f.handler(f.request({ action: 'delete', confirmation: 'DELETE' }));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.stage, 'revenuecat');
    assert.equal(body.photosRemoved, 5);
    assert.ok(!f.events.includes('auth'));
  });
  it('reports auth deletion failure after photos, permits absent provider configuration', async () => {
    const f = fixture();
    f.store.deleteSubscriber = async () => 'not_configured';
    f.store.deleteAuth = async () => { throw new Error('database internal'); };
    const response = await f.handler(f.request({ action: 'delete', confirmation: 'DELETE' }));
    const body = await response.json();
    assert.equal(body.stage, 'auth');
    assert.equal(body.code, 'DELETION_INCOMPLETE');
    assert.equal(body.subscriber, 'not_configured');
    assert.equal(body.deleted, undefined);
  });
  it('never deletes a photo outside the verified owner prefix', async () => {
    const f = fixture();
    f.photos[0].name = `${other}/secret.jpg`;
    const response = await f.handler(f.request({ action: 'delete', confirmation: 'DELETE' }));
    assert.equal(response.status, 409);
    assert.deepEqual(f.events, ['photos:0']);
  });
});
