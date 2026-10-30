import { config } from '../config';
import { supabase } from '../supabase';

export async function createInstacartLink(items: { name: string; quantity: string | null; barcode: string | null }[]): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Log in to order groceries.');
  const response = await fetch(`${config.supabaseUrl}/functions/v1/grocery-order`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: items.map(({ name, quantity, barcode }) => ({ name, quantity, barcode })) }),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 404) throw new Error('Grocery ordering is not set up yet.');
  const data = await response.json().catch(() => null) as { url?: unknown; error?: unknown } | null;
  if (!response.ok || typeof data?.url !== 'string') throw new Error(typeof data?.error === 'string' ? data.error : 'Could not build your Instacart cart.');
  return data.url;
}
