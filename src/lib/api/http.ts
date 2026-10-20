import { USER_AGENT } from '../config';

export class ApiError extends Error {}

/** fetch with a descriptive User-Agent (required by Open Food Facts), a timeout, and JSON parsing. */
export async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Could not reach the food database. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}
