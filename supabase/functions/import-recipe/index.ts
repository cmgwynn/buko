import { createImportHandler } from './handler.ts';
import { requirePremium } from '../_shared/premium.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase function configuration.');

Deno.serve(createImportHandler({
  authorizePremium: (token) => requirePremium(supabaseUrl, anonKey, token),
  async authenticate(token) {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) throw new Error(`Session verification failed (${response.status}).`);
    return true;
  },
}));
