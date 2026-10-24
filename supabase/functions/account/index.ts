import { AccountError, createAccountHandler, type AccountStore, type DataPage } from './handler.ts';
import { authenticationTime } from './authorization.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};
const url = Deno.env.get('SUPABASE_URL');
const anon = Deno.env.get('SUPABASE_ANON_KEY');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !anon || !service) throw new Error('Missing account function server configuration.');
const subscriberSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
const base = url;
const serverKey = service;

async function serverRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${serverKey}`, apikey: serverKey, 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AccountError('Account storage or database operation failed. Check migration 0007 and retry.');
  }
  return response;
}
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await serverRequest(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })).json();
}
const encodedPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

Deno.serve(createAccountHandler({
  async authenticate(token): Promise<AccountStore> {
    const response = await fetch(`${base}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon! }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AccountError('Your session is no longer valid. Sign in again.', 401, 'UNAUTHORIZED');
    }
    const user = await response.json();
    if (typeof user.id !== 'string') throw new AccountError('Sign in again.', 401, 'UNAUTHORIZED');
    // Decode only AFTER GoTrue verifies this exact token. iat is intentionally NOT used.
    let authenticatedAt = NaN;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      authenticatedAt = authenticationTime(payload, user.id, user.last_sign_in_at);
    } catch {
      throw new AccountError('Sign in again to confirm your identity.', 401, 'REAUTH_REQUIRED');
    }
    const userId: string = user.id;
    return {
      userId, authenticatedAt,
      // GoTrue's user-facing representation includes metadata/identities, never password hashes or session tokens.
      user,
      tables: () => rpc<string[]>('account_export_tables'),
      page: (table, offset, limit) => rpc<DataPage>('account_export_page', {
        p_user_id: userId, p_table: table, p_offset: offset, p_limit: limit,
      }),
      photos: (offset, limit) => rpc<DataPage>('account_photo_page', { p_user_id: userId, p_offset: offset, p_limit: limit }),
      async downloadPhoto(path) {
        return serverRequest(`/storage/v1/object/authenticated/recipe-photos/${encodedPath(path)}`);
      },
      async removePhotos(paths) {
        await serverRequest('/storage/v1/object/recipe-photos', { method: 'DELETE', body: JSON.stringify({ prefixes: paths }) });
      },
      async deleteSubscriber() {
        if (!subscriberSecret) return 'not_configured';
        const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${subscriberSecret}` }, signal: AbortSignal.timeout(15000),
        });
        if (!response.ok && response.status !== 404) {
          await response.body?.cancel();
          throw new AccountError('The purchase provider could not remove its subscriber record. No subscription has been cancelled. Retry deletion.');
        }
        await response.body?.cancel();
        return 'deleted';
      },
      async deleteAuth() {
        await serverRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE', body: JSON.stringify({ should_soft_delete: false }),
        });
      },
    };
  },
}));
