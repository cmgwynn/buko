import { createGroceryOrderHandler } from './handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
if (!supabaseUrl || !anonKey) throw new Error('Missing Supabase function configuration.');

Deno.serve(createGroceryOrderHandler({
  enabled: Deno.env.get('GROCERY_ORDERING_ENABLED') === 'true',
  apiKey: Deno.env.get('INSTACART_API_KEY') ?? '',
  // Use https://connect.dev.instacart.tools with a development key until Instacart approves production.
  baseUrl: Deno.env.get('INSTACART_BASE_URL') ?? 'https://connect.instacart.com',
  linkbackUrl: Deno.env.get('INSTACART_LINKBACK_URL') ?? 'https://cmgwynn.github.io/buko/grocery',
  async authenticate(token) {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey }, signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) throw new Error(`Session verification failed (${response.status}).`);
    return true;
  },
}));
