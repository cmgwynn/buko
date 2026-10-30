import { BodyError, boundedJson } from '../_shared/body.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const MAX_ORDER_ITEMS = 100;

export interface OrderItem { name: string; quantity?: string | null; barcode?: string | null }
export interface InstacartLineItem { name: string; display_text: string; upcs?: string[] }

/** Only product names, the user's quantity note and valid UPCs leave Buko. No account details are sent. */
export function toLineItems(value: unknown): InstacartLineItem[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) throw new BodyError('Send a list of grocery items.', 400);
  const raw = (value as { items: unknown[] }).items;
  if (raw.length === 0) throw new BodyError('Your list is empty.', 400);
  if (raw.length > MAX_ORDER_ITEMS) throw new BodyError(`Order up to ${MAX_ORDER_ITEMS} items at a time.`, 400);
  const seen = new Set<string>();
  const items: InstacartLineItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') throw new BodyError('Each item needs a name.', 400);
    const { name, quantity, barcode } = entry as OrderItem;
    if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new BodyError('Each item needs a name under 120 characters.', 400);
    const clean = name.trim().replace(/\s+/g, ' ');
    const note = typeof quantity === 'string' && quantity.trim() ? quantity.trim().slice(0, 40) : '';
    const upc = typeof barcode === 'string' && /^(\d{12}|\d{14})$/.test(barcode) && !seen.has(barcode) ? barcode : null;
    if (upc) seen.add(upc);
    items.push({ name: clean, display_text: note ? `${clean} (${note})` : clean, ...(upc ? { upcs: [upc] } : {}) });
  }
  return items;
}

export function createGroceryOrderHandler(options: {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  linkbackUrl?: string;
  authenticate: (token: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}) {
  const send = options.fetchImpl ?? fetch;
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    if (!options.enabled || !options.apiKey) return json({ error: 'Grocery ordering is not available yet.', code: 'disabled' }, 503);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Log in to order groceries.' }, 401);
    try {
      if (!(await options.authenticate(authorization.slice(7)))) return json({ error: 'Your session expired. Log in again.' }, 401);
      const lineItems = toLineItems(await boundedJson(request, 32_000));
      const response = await send(`${options.baseUrl}/idp/v1/products/products_link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'My Buko grocery list',
          link_type: 'shopping_list',
          expires_in: 7,
          line_items: lineItems,
          ...(options.linkbackUrl ? { landing_page_configuration: { partner_linkback_url: options.linkbackUrl } } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) { await response.body?.cancel(); return json({ error: 'Instacart could not build your cart right now. Try again shortly.' }, 502); }
      const data = await response.json() as { products_link_url?: unknown };
      const url = typeof data.products_link_url === 'string' ? data.products_link_url : '';
      if (!/^https:\/\/([a-z0-9-]+\.)*instacart\.(com|tools)\//i.test(url)) return json({ error: 'Instacart returned an unexpected link.' }, 502);
      return json({ url, count: lineItems.length });
    } catch (error) {
      if (error instanceof BodyError) return json({ error: error.message }, error.status);
      return json({ error: 'Could not build your Instacart cart. Please retry.' }, 502);
    }
  };
}
