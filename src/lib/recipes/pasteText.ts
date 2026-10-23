import type { RecipeDraft } from './draft';
import { ImportError, normaliseUrl } from './importer';
import { draftFromText } from './matching';
import type { ParsedRecipe } from './schemaOrg';
import { detectTimerSeconds } from './timers';

export interface PastedRecipeInput {
  title: string;
  servings: string;
  ingredients: string;
  steps: string;
  sourceUrl?: string;
  sourceName?: string;
}

export function recipeToDraft(recipe: Omit<ParsedRecipe, 'sourceUrl' | 'sourceName'> & {
  sourceUrl: string | null;
  sourceName: string | null;
}): RecipeDraft {
  return {
    title: recipe.title,
    servings: recipe.servings ?? 4,
    servingsGuessed: recipe.servings === null,
    siteCalories: recipe.siteCalories,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    sourceUrl: recipe.sourceUrl,
    sourceName: recipe.sourceName,
    photoPath: null,
    photoUri: null,
    ingredients: recipe.ingredients.map((text, position) => draftFromText(text, position)),
    steps: recipe.steps.map((text, position) => ({ position, text, timer_seconds: detectTimerSeconds(text) })),
  };
}

const stripBullet = (line: string) => line.replace(/^\s*(?:[•●▪*-]\s+|\d+[.)]\s+)/, '').trim();

export function draftFromPastedRecipe(input: PastedRecipeInput): RecipeDraft {
  if (Object.values(input).some((value) => value && value.length > 100_000)) {
    throw new ImportError('That text is too long. Paste only the recipe title, ingredients and steps.');
  }
  const title = input.title.trim();
  if (!title) throw new ImportError('Enter a recipe title.');
  const servingsText = input.servings.trim();
  const servings = servingsText ? Number(servingsText) : null;
  if (servingsText && (!/^\d+$/.test(servingsText) || servings === null || servings < 1 || servings > 100)) {
    throw new ImportError('Enter a whole-number serving count from 1 to 100, or leave it blank to start with 4.');
  }
  const ingredients = input.ingredients.replace(/\r\n?/g, '\n').split('\n').map(stripBullet).filter(Boolean);
  const steps = input.steps.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/).map((paragraph) =>
    stripBullet(paragraph).replace(/\s+/g, ' ').trim(),
  ).filter(Boolean);
  if (!ingredients.length) throw new ImportError('Paste at least one ingredient, one per line.');
  if (!steps.length) throw new ImportError('Paste at least one instruction. Separate steps with a blank line.');
  const sourceUrl = input.sourceUrl?.trim() ? normaliseUrl(input.sourceUrl) : null;
  const sourceName = input.sourceName?.trim() || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : null);
  return recipeToDraft({
    title, servings, ingredients, steps, sourceUrl, sourceName,
    siteCalories: null, prepMinutes: null, cookMinutes: null,
  });
}
