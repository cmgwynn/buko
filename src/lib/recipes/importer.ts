import { USER_AGENT } from '../config';
import { extractRecipeFromHtml, type ParsedRecipe } from './schemaOrg';

const MAX_BYTES = 3_000_000;

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
    if (length > MAX_BYTES) throw new ImportError('That page is too large to import.');
    html = await res.text();
    if (html.length > MAX_BYTES) throw new ImportError('That page is too large to import.');
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('Could not reach that page. Check the link and your connection.');
  } finally {
    clearTimeout(timer);
  }
  const parsed = extractRecipeFromHtml(html, url);
  if (!parsed) {
    throw new ImportError("This page doesn't include structured recipe data, so it can't be imported. You can add the recipe by hand instead.");
  }
  return parsed;
}
