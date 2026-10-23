import { USER_AGENT } from '../config';
import { extractRecipeFromHtml, type ParsedRecipe } from './schemaOrg';

export const MAX_RECIPE_BYTES = 3_000_000;

export class ImportError extends Error {}

export function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ImportError('That does not look like a web address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImportError('Only http and https links can be imported.');
  return url.toString();
}

export function importRecipeFromHtml(html: string, input: string): ParsedRecipe {
  const url = normaliseUrl(input);
  if (new TextEncoder().encode(html).byteLength > MAX_RECIPE_BYTES) throw new ImportError('That page is too large to import (maximum 3 MB).');
  const parsed = extractRecipeFromHtml(html, url);
  if (!parsed) {
    throw new ImportError("This page doesn't include structured recipe data, so it can't be imported. Save the full web page, not Reader view, or add the recipe by hand.");
  }
  return parsed;
}

export async function importRecipeViaBackend(input: string, options: {
  supabaseUrl: string; anonKey: string; accessToken: string;
}): Promise<ParsedRecipe> {
  const url = normaliseUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${options.supabaseUrl}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.accessToken}`, apikey: options.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    if (response.status === 404) throw new ImportError('The recipe import service is not deployed yet. Use a saved HTML page below, or deploy the Supabase function described in the README.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new ImportError('The recipe import service returned an invalid response.');
    if (!response.ok) {
      const message = 'error' in data && typeof data.error === 'string' ? data.error : `Recipe import failed (${response.status}).`;
      throw new ImportError(message);
    }
    if (!('html' in data) || typeof data.html !== 'string' || !('sourceUrl' in data) || typeof data.sourceUrl !== 'string') {
      throw new ImportError('The recipe import service returned an invalid response.');
    }
    return importRecipeFromHtml(data.html, data.sourceUrl);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Could not reach the recipe import service. Try again, or import a saved HTML page below.');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a recipe page directly from the phone and parse its schema.org data.
 * Only the page being imported is contacted, and nothing about the user is sent.
 */
export async function importRecipeFromUrl(input: string): Promise<ParsedRecipe> {
  const url = normaliseUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal,
    });
    if (!res.ok) throw new ImportError(`The site returned an error (${res.status}). Try another link or add the recipe by hand.`);
    const length = Number(res.headers.get('content-length') ?? 0);
    if (length > MAX_RECIPE_BYTES) throw new ImportError('That page is too large to import.');
    html = await res.text();
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('Could not reach that page. Check the link and your connection.');
  } finally {
    clearTimeout(timer);
  }
  return importRecipeFromHtml(html, url);
}
