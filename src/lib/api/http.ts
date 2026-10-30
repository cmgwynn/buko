import { USER_AGENT } from '../config';

export class ApiError extends Error {}

/** fetch with a descriptive User-Agent (required by Open Food Facts), a timeout, and JSON parsing. */
export async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  // In browsers a custom User-Agent triggers a CORS preflight, which OFF's search endpoint rejects;
  // the browser sends its own User-Agent anyway.
  const headers: Record<string, string> = isBrowser() ? { Accept: 'application/json' } : { 'User-Agent': USER_AGENT, Accept: 'application/json' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    if (res.status === 429 || res.status >= 500) throw new ApiError(`The food database is busy right now (${res.status}). Try again in a minute.`);
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Browsers report an overloaded server without CORS headers the same way as being offline.
    throw new ApiError('Could not reach the food database. It may be busy, or you may be offline. Try again in a minute.');
  } finally {
    clearTimeout(timer);
  }
}

function isBrowser(): boolean {
  return typeof document !== 'undefined';
}
