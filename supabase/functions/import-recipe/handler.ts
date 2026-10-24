const MAX_PAGE_BYTES = 3_000_000;
const RECIPE_HOSTS = ['simplyrecipes.com', 'allrecipes.com', 'bbcgoodfood.com', 'budgetbytes.com', 'spendwithpennies.com'];
const ALLOWED_HOSTS = new Set(RECIPE_HOSTS.flatMap((host) => [host, `www.${host}`]));
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function recipeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RequestError('Enter a valid recipe web address.', 400);
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new RequestError(`URL import supports HTTPS links from ${RECIPE_HOSTS.join(', ')} (including www). For other sites, paste the ingredients and steps instead.`, 400);
  }
  return url;
}

async function readLimited(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new RequestError('That page or request is too large to import.', 413);
  }
  if (!response.body) throw new RequestError('The site returned an empty page.', 422);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new RequestError('That page or request is too large to import.', 413);
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function createImportHandler(options: {
  authenticate: (token: string) => Promise<boolean>;
  authorizePremium?: (token: string) => Promise<void>;
  fetchPage?: typeof fetch;
}) {
  const fetchPage = options.fetchPage ?? fetch;
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'POST') return json({ error: 'Use POST to import a recipe.' }, 405);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Log in to import a recipe.' }, 401);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (!(await options.authenticate(authorization.slice(7)))) return json({ error: 'Your session expired. Log in again.' }, 401);
      await options.authorizePremium?.(authorization.slice(7));
      let body: unknown;
      try {
        body = JSON.parse(await readLimited(new Response(request.body, { headers: request.headers }), 4096));
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError('Send a JSON request containing a recipe URL.', 400);
      }
      if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
        throw new RequestError('Enter a recipe web address.', 400);
      }
      let url = recipeUrl(body.url);
      for (let redirects = 0; redirects <= 5; redirects++) {
        const response = await fetchPage(url, {
          redirect: 'manual',
          headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Buko/1.0 (recipe importer)' },
          signal: controller.signal,
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location) throw new RequestError('The site returned an invalid redirect.', 422);
          try {
            url = recipeUrl(new URL(location, url).toString());
          } catch (error) {
            if (error instanceof RequestError) throw error;
            throw new RequestError('The site returned an invalid redirect. Paste the ingredients and steps instead.', 422);
          }
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new RequestError(`The recipe site blocked or rejected the request (${response.status}). We cannot bypass publisher restrictions. Open a recipe you can access and paste its ingredients and steps instead.`, 422);
        }
        if (!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(response.headers.get('content-type') ?? '')) {
          await response.body?.cancel();
          throw new RequestError('That address does not return an HTML recipe page.', 422);
        }
        const html = await readLimited(response, MAX_PAGE_BYTES);
        return json({ html, sourceUrl: url.toString() });
      }
      throw new RequestError('The site redirected too many times. Try its final recipe URL.', 422);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      if (error instanceof Error && 'status' in error && typeof error.status === 'number' && [402, 503].includes(error.status)) {
        return json({ error: error.message }, error.status);
      }
      console.error('Recipe import request failed:', error instanceof Error ? error.name : 'Unknown error');
      return json({ error: 'Could not fetch the recipe page. Try again, or paste the ingredients and steps instead.' }, 502);
    } finally {
      clearTimeout(timer);
    }
  };
}
