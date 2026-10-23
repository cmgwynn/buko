import { extractRecipeFromHtml, type ParsedRecipe } from './schemaOrg';

export const MAX_RECIPE_BYTES = 3_000_000;
export const SUPPORTED_RECIPE_HOSTS = [
  'simplyrecipes.com', 'allrecipes.com', 'bbcgoodfood.com', 'budgetbytes.com', 'spendwithpennies.com',
] as const;
export const SUPPORTED_RECIPE_SITES = SUPPORTED_RECIPE_HOSTS.join(', ');

export class ImportError extends Error {}

export function normaliseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ImportError('Enter a recipe web address.');
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ImportError('That does not look like a web address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImportError('Only http and https links can be imported.');
  if (url.username || url.password) throw new ImportError('Use a web address without a username or password.');
  return url.toString();
}

export function supportedRecipeUrl(input: string): string {
  const url = new URL(normaliseUrl(input));
  const host = url.hostname.replace(/^www\./, '');
  if (url.protocol !== 'https:' || url.port || !SUPPORTED_RECIPE_HOSTS.some((allowed) => host === allowed)) {
    throw new ImportError(`URL import supports HTTPS links from ${SUPPORTED_RECIPE_SITES} (including www). For other sites, paste the ingredients and steps below.`);
  }
  return url.toString();
}

export function importRecipeFromHtml(html: string, input: string): ParsedRecipe {
  const url = normaliseUrl(input);
  if (new TextEncoder().encode(html).byteLength > MAX_RECIPE_BYTES) throw new ImportError('That page is too large to import (maximum 3 MB).');
  const parsed = extractRecipeFromHtml(html, url);
  if (!parsed) {
    throw new ImportError("This page doesn't include structured recipe data. Paste its ingredients and steps below to create an editable draft.");
  }
  return parsed;
}

export async function importRecipeViaBackend(input: string, options: {
  supabaseUrl: string; anonKey: string; accessToken: string;
}): Promise<ParsedRecipe> {
  const url = supportedRecipeUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${options.supabaseUrl}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.accessToken}`, apikey: options.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    if (response.status === 404) throw new ImportError('The recipe import service (import-recipe) is not deployed or is unavailable. Paste the ingredients and steps below instead; no HTML file is needed.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') throw new ImportError('The recipe import service returned an invalid response.');
    if (!response.ok) {
      const message = 'error' in data && typeof data.error === 'string' ? data.error : `Recipe import failed (${response.status}).`;
      throw new ImportError(message);
    }
    if (!('html' in data) || typeof data.html !== 'string' || !('sourceUrl' in data) || typeof data.sourceUrl !== 'string') {
      throw new ImportError('The recipe import service returned an invalid response.');
    }
    return importRecipeFromHtml(data.html, supportedRecipeUrl(data.sourceUrl));
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Could not reach the recipe import service. Check your connection and try again, or paste the ingredients and steps below.');
  } finally {
    clearTimeout(timer);
  }
}

// Native and web use the same authenticated, allowlisted fetch service.
export const importRecipeFromUrl = importRecipeViaBackend;
