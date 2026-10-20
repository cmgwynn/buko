/**
 * Extracts structured schema.org Recipe data (JSON-LD) from a page's HTML.
 *
 * Deliberately narrow: we keep only title, ingredients, steps, yield, times, and where the
 * recipe came from. We never copy descriptions, stories, images, reviews or any other page text.
 */
export interface ParsedRecipe {
  title: string;
  ingredients: string[];
  steps: string[];
  servings: number | null;
  /** Per-serving calories the page publishes in its structured nutrition data, if any. */
  siteCalories: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  sourceUrl: string;
  sourceName: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const clean = (s: unknown): string =>
  typeof s === 'string' ? decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim() : '';

/** ISO-8601 duration ("PT1H30M") to minutes. */
export function parseDurationMinutes(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^P(?:(\d+)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(v.trim());
  if (!m) return null;
  const mins = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60;
  return mins > 0 ? Math.round(mins) : null;
}

function parseYield(v: unknown): number | null {
  const first = Array.isArray(v) ? v.find((x) => /\d/.test(String(x))) ?? v[0] : v;
  const m = /\d+/.exec(String(first ?? ''));
  const n = m ? Number(m[0]) : NaN;
  return n >= 1 && n <= 100 ? n : null;
}

function parseSiteCalories(v: unknown): number | null {
  if (!v || typeof v !== 'object') return null;
  const m = /\d+(\.\d+)?/.exec(String((v as Record<string, unknown>).calories ?? ''));
  const n = m ? Number(m[0]) : NaN;
  return n > 0 && n < 5000 ? Math.round(n) : null;
}

function collectSteps(v: unknown, out: string[]) {
  if (!v) return;
  if (typeof v === 'string') {
    // A single string may hold several steps separated by line breaks.
    for (const line of v.split(/\r?\n|<br\s*\/?>/i)) {
      const t = clean(line);
      if (t) out.push(t);
    }
  } else if (Array.isArray(v)) {
    for (const item of v) collectSteps(item, out);
  } else if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.itemListElement) collectSteps(o.itemListElement, out); // HowToSection
    else if (typeof o.text === 'string') collectSteps(o.text, out);
    else if (typeof o.name === 'string') collectSteps(o.name, out);
  }
}

function typeIncludes(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

function findRecipeNodes(value: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const v of value) findRecipeNodes(v, out);
  } else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    if (typeIncludes(node, 'Recipe')) out.push(node);
    if (node['@graph']) findRecipeNodes(node['@graph'], out);
  }
}

export function extractRecipeFromHtml(html: string, sourceUrl: string): ParsedRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes: Record<string, unknown>[] = [];
  for (const b of blocks) {
    try {
      findRecipeNodes(JSON.parse(b[1].trim()), nodes);
    } catch {
      // Ignore malformed blocks; other blocks on the page may still be valid.
    }
  }
  const node = nodes.find((n) => Array.isArray(n.recipeIngredient) && n.recipeIngredient.length > 0);
  if (!node) return null;

  const ingredients = (node.recipeIngredient as unknown[]).map(clean).filter(Boolean);
  const steps: string[] = [];
  collectSteps(node.recipeInstructions, steps);
  const title = clean(node.name);
  if (!title || ingredients.length === 0) return null;

  let host = sourceUrl;
  try {
    host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    // keep raw string
  }
  return {
    title,
    ingredients,
    steps,
    servings: parseYield(node.recipeYield),
    siteCalories: parseSiteCalories(node.nutrition),
    prepMinutes: parseDurationMinutes(node.prepTime),
    cookMinutes: parseDurationMinutes(node.cookTime),
    sourceUrl,
    sourceName: host,
  };
}
