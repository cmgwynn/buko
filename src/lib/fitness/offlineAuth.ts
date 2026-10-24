import type { Session } from '@supabase/supabase-js';

/** A cached identity permits local recovery only; Supabase still authorizes every remote request. */
export function parseOfflineSession(raw: string | null): Session | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as Session;
  return value && typeof value.access_token === 'string' && typeof value.refresh_token === 'string'
    && typeof value.token_type === 'string' && typeof value.expires_in === 'number'
    && value.user && typeof value.user.id === 'string' && value.user.id.length > 0
    ? value : null;
}
