import { readPhoto } from './assets.ts';
import { AccountError } from './errors.ts';

export { AccountError } from './errors.ts';

export interface DataPage {
  rows: Record<string, unknown>[];
  total: number;
  revision: string;
}
export interface AccountStore {
  userId: string;
  user: Record<string, unknown>;
  /** Actual authentication time, not the refreshed access token's iat. */
  authenticatedAt: number;
  tables(): Promise<string[]>;
  page(table: string, offset: number, limit: number): Promise<DataPage>;
  photos(offset: number, limit: number): Promise<DataPage>;
  downloadPhoto(path: string): Promise<Response>;
  removePhotos(paths: string[]): Promise<void>;
  deleteSubscriber(): Promise<'deleted' | 'not_configured'>;
  deleteAuth(): Promise<void>;
}
export interface AccountDependencies {
  authenticate(token: string): Promise<AccountStore>;
  now?: () => number;
  pageSize?: number;
  maxRows?: number;
  maxBytes?: number;
  maxPhotos?: number;
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
async function readBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        throw new AccountError('Request is too large.', 413, 'INVALID_REQUEST');
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}
function checkPage(page: DataPage, limit: number) {
  if (!Array.isArray(page.rows) || page.rows.length > limit || !Number.isSafeInteger(page.total) ||
      page.total < 0 || typeof page.revision !== 'string') throw new AccountError('Invalid export response. Please retry.');
}
function ownedPhoto(row: Record<string, unknown>, userId: string): string {
  const path = row.name;
  if (typeof path !== 'string' || !path.startsWith(`${userId}/`) || path.includes('/../') || path.endsWith('/..')) {
    throw new AccountError('Photo ownership could not be verified. Nothing further was deleted.', 409, 'OWNERSHIP_ERROR');
  }
  return path;
}
export const retentionNotice = [
  'Deletion removes the active Buko account, its database records and private recipe photos.',
  'It does not cancel Apple, Google or other store subscriptions. Manage them separately.',
  'Apple Health and Health Connect originals and previously written health records remain in the health app; manage them there.',
  'Downloaded exports and copies you shared are not removed.',
  'Database backups, infrastructure/security logs and external provider records may remain under their own retention policies; this action does not promise immediate backup erasure.',
  'RevenueCat subscriber deletion is attempted when its server secret is configured. App stores and payment providers retain their own purchase records.',
];

export function createAccountHandler(deps: AccountDependencies) {
  const now = deps.now ?? Date.now;
  const size = deps.pageSize ?? 250;
  const maxRows = deps.maxRows ?? 25000;
  const maxBytes = deps.maxBytes ?? 20 * 1024 * 1024;
  const maxPhotos = deps.maxPhotos ?? 1000;
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Use POST.', code: 'METHOD_NOT_ALLOWED' }, 405);
    let stage = 'authorization';
    let photosRemoved = 0;
    let deleting = false;
    let subscriber: string | undefined;
    try {
      const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
      if (!token) throw new AccountError('Sign in to manage your account.', 401, 'UNAUTHORIZED');
      const store = await deps.authenticate(token);
      if (!/^[0-9a-f-]{36}$/i.test(store.userId)) throw new AccountError('Sign in again.', 401, 'UNAUTHORIZED');
      let body: { action?: unknown; confirmation?: unknown };
      const text = await readBody(request);
      try { body = JSON.parse(text); } catch { throw new AccountError('Invalid request.', 400, 'INVALID_REQUEST'); }
      if (!body || (body.action !== 'export' && body.action !== 'delete')) {
        throw new AccountError('Choose export or delete.', 400, 'INVALID_REQUEST');
      }
      const age = now() / 1000 - store.authenticatedAt;
      if (!Number.isFinite(age) || age < -60 || age > 600) {
        throw new AccountError('Confirm your password or sign in again, then retry within 10 minutes.', 401, 'REAUTH_REQUIRED');
      }
      if (body.action === 'delete') {
        if (body.confirmation !== 'DELETE') throw new AccountError('Type DELETE exactly to confirm.', 400, 'CONFIRMATION_REQUIRED');
        deleting = true;
        stage = 'storage';
        // Always drain page zero: deleting a page shifts every remaining offset.
        while (true) {
          const page = await store.photos(0, size);
          checkPage(page, size);
          if (page.rows.length === 0) {
            if (page.total !== 0) throw new AccountError('Photo listing was incomplete. Retry deletion.');
            break;
          }
          const paths = page.rows.map((row) => ownedPhoto(row, store.userId));
          await store.removePhotos(paths);
          photosRemoved += paths.length;
          if (photosRemoved > maxRows) throw new AccountError('Too many photos for one request. Retry deletion to continue.', 413);
        }
        stage = 'revenuecat';
        subscriber = await store.deleteSubscriber();
        stage = 'auth';
        await store.deleteAuth();
        return json({ deleted: true, photosRemoved, subscriber, retention: retentionNotice });
      }
      stage = 'export';
      const tables = await store.tables();
      if (!Array.isArray(tables) || tables.length > 200 || new Set(tables).size !== tables.length ||
          tables.some((table) => !/^[a-z_][a-z0-9_]*$/.test(table))) throw new AccountError('Invalid export inventory.');
      const data: Record<string, Record<string, unknown>[]> = {};
      let rowCount = 0;
      let bytes = 0;
      const revisions = new Map<string, string>();
      async function collect(table: string, getter: (offset: number, limit: number) => Promise<DataPage>) {
        const rows: Record<string, unknown>[] = [];
        let revision: string | undefined;
        let total: number | undefined;
        do {
          const page = await getter(rows.length, size);
          checkPage(page, size);
          if (total === undefined) {
            total = page.total;
            revision = page.revision;
            if (rowCount + total > maxRows || (table === '$photos' && total > maxPhotos)) throw new AccountError('Export exceeds the safe download limit. No partial export was returned. Contact the app operator for a complete assisted export.', 413, 'EXPORT_TOO_LARGE');
          }
          if (page.total !== total || page.revision !== revision) throw new AccountError('Your data changed during export. Stop editing and retry.', 409, 'EXPORT_CHANGED');
          if (page.rows.length === 0 && rows.length < total) throw new AccountError('Export pagination was incomplete. No partial export was returned.');
          bytes += new TextEncoder().encode(JSON.stringify(page.rows)).length;
          if (bytes > maxBytes) throw new AccountError('Export exceeds the safe download size. No partial export was returned. Contact the app operator for a complete assisted export.', 413, 'EXPORT_TOO_LARGE');
          if (table !== '$photos' && page.rows.some((row) => row.user_id !== store.userId)) throw new AccountError('Export ownership validation failed.', 409, 'OWNERSHIP_ERROR');
          rows.push(...page.rows);
          if (rows.length > total) throw new AccountError('Invalid export pagination.');
        } while (rows.length < total!);
        rowCount += rows.length;
        revisions.set(table, revision!);
        return rows;
      }
      for (const table of tables) data[table] = await collect(table, (offset, limit) => store.page(table, offset, limit));
      const photos = await collect('$photos', (offset, limit) => store.photos(offset, limit));
      const assets: Record<string, unknown>[] = [];
      const paths = photos.map((row) => ownedPhoto(row, store.userId));
      for (let index = 0; index < photos.length; index++) {
        // Download sequentially so one large image cannot multiply in-flight memory.
        const remainingRawBytes = Math.floor(Math.max(0, maxBytes - bytes - 4096) / 4) * 3;
        const photo = await readPhoto(await store.downloadPhoto(paths[index]), Math.min(5 * 1024 * 1024, remainingRawBytes));
        const asset = {
          ...photos[index], path: paths[index], encoding: 'base64',
          contentType: photo.contentType, byteLength: photo.byteLength, base64: photo.base64,
        };
        bytes += new TextEncoder().encode(JSON.stringify(asset)).length;
        if (bytes > maxBytes) throw new AccountError('Photo data exceeds the 20 MiB export budget. No partial export was returned. Contact the app operator for a complete assisted export.', 413, 'EXPORT_TOO_LARGE');
        assets.push(asset);
      }
      // Fail closed if any table changed while other tables/photos were being collected.
      if (JSON.stringify(await store.tables()) !== JSON.stringify(tables)) throw new AccountError('Export inventory changed. Please retry.', 409, 'EXPORT_CHANGED');
      for (const table of [...tables, '$photos']) {
        const page = table === '$photos' ? await store.photos(0, 1) : await store.page(table, 0, 1);
        if (page.revision !== revisions.get(table)) throw new AccountError('Your data changed during export. Stop editing and retry.', 409, 'EXPORT_CHANGED');
      }
      const output = {
        format: 'buko-account-export', version: 2, generated_at: new Date(now()).toISOString(),
        account: store.user, data, assets,
        notes: [
          'Includes every public database table with a UUID user_id column, including private server-managed usage and billing rows.',
          'Seeded/shared exercise and starter-library content is not personal data and is not included.',
          'Every saved private recipe photo is embedded as durable base64 bytes with path, contentType and byteLength. No credentials or expiring image links are required to read the archive.',
          'This is a checked multi-query export, not a single transactional snapshot. Do not edit data during export.',
          ...retentionNotice,
        ],
      };
      if (new TextEncoder().encode(JSON.stringify(output)).length > maxBytes) throw new AccountError('Export exceeds the safe download size. No partial export was returned. Contact the app operator for an assisted export.', 413, 'EXPORT_TOO_LARGE');
      return json(output);
    } catch (error) {
      const safe = error instanceof AccountError ? error : new AccountError('Account service is unavailable. Please retry.');
      if (deleting) return json({
        error: `Deletion did not finish at the ${stage} step. Your account was not confirmed deleted. ${safe.message} Retry this same deletion; some photos or provider data may already have been removed.`,
        code: 'DELETION_INCOMPLETE', stage, photosRemoved, subscriber, retryable: true,
      }, safe.status);
      return json({ error: safe.message, code: safe.code }, safe.status);
    }
  };
}
