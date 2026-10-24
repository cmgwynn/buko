import { computeRecipeNutrition } from '../nutrition.ts';
import type { IngredientDraft } from '../types.ts';
import { resolveUnit } from '../units.ts';
import { checkRecipe, ingredientIdentity, isQualityRecipe, isRecord, normalizeFood, stableRecipeJson } from './checks.ts';
import { CHEF_REVIEW_PROMPT_VERSION, CHEF_REVIEW_SYSTEM, RECIPE_ADAPT_SYSTEM, RECIPE_SAFETY_REFERENCES } from './chefPrompt.ts';
import type { BaseVersion, ChefReview, QualityRecipe, QualityResult, RecipeAttempt, RecipeConstraints, RecipeModel } from './types.ts';

export class RecipeQualityError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) { super(message); }
}
export interface SuggestRecipeOptions {
  bases: BaseVersion[];
  constraints: RecipeConstraints;
  baseVersionId?: string;
  enabled: boolean;
  disabledReason?: string;
  model?: RecipeModel;
  reserve?: (kind: 'adapt' | 'review', attempt: number) => Promise<boolean>;
  timeoutMs?: number;
}
const categories = ['balance', 'aromatics', 'texture', 'seasoning', 'technique', 'compatibility', 'practicality', 'restriction', 'scope'];
export function parseChefReview(value: unknown): ChefReview {
  if (!isRecord(value) || Object.keys(value).length !== 5
    || !['decision', 'note', 'issues', 'changes', 'corrected_recipe'].every((key) => key in value)
    || !['approve', 'fix', 'reject'].includes(String(value.decision))
    || typeof value.note !== 'string' || !value.note.trim() || value.note.length > 300
    || !Array.isArray(value.issues) || value.issues.length > 30
    || !value.issues.every((i) => isRecord(i) && Object.keys(i).length === 3 && categories.includes(String(i.category))
      && ['warning', 'blocking'].includes(String(i.severity)) && typeof i.detail === 'string' && i.detail.length > 0 && i.detail.length <= 1000)
    || !Array.isArray(value.changes) || value.changes.length > 30
    || !value.changes.every((c) => isRecord(c) && Object.keys(c).length === 2 && typeof c.path === 'string'
      && c.path.length > 0 && c.path.length <= 200 && typeof c.reason === 'string' && c.reason.length > 0 && c.reason.length <= 500)
    || (value.decision === 'fix' ? !isQualityRecipe(value.corrected_recipe) : value.corrected_recipe !== null)
    || value.decision === 'approve' && value.issues.some((i) => i.severity === 'blocking'))
    throw new RecipeQualityError('Chef review returned malformed data.', 'invalid_review', 502);
  return value as unknown as ChefReview;
}

function swapAllowed(ingredient: IngredientDraft, base: BaseVersion): boolean {
  const allowed = [...base.adaptation_policy.allowedProteinSwaps, ...base.adaptation_policy.allowedDietarySwaps].map(normalizeFood);
  return allowed.includes(normalizeFood(ingredient.name)) || !!ingredient.food_source_id && allowed.includes(normalizeFood(ingredient.food_source_id));
}

export function canonicalCatalog(bases: BaseVersion[], base: BaseVersion): IngredientDraft[] {
  const own = base.recipe.ingredients;
  const replacements = bases.flatMap((b) => b.recipe.ingredients).filter((i) => swapAllowed(i, base)
    && i.food_source === 'usda' && !!i.food_source_id && computeRecipeNutrition([i], 1).complete);
  return [...new Map([...own, ...replacements].map((i) => [ingredientIdentity(i), structuredClone(i)])).values()];
}

export function validateAdaptation(recipe: unknown, base: BaseVersion, catalog: IngredientDraft[], constraints: RecipeConstraints): QualityRecipe {
  const report = checkRecipe(recipe, constraints, catalog);
  if (!report.valid || !isQualityRecipe(recipe)) throw new RecipeQualityError(report.issues.filter((i) => i.severity === 'blocking').map((i) => i.detail).join(' '), 'invalid_candidate', 502);
  const original = base.recipe;
  if (recipe.ingredients.length !== original.ingredients.length || recipe.cuisine !== original.cuisine
    || JSON.stringify(recipe.mealTypes) !== JSON.stringify(original.mealTypes))
    throw new RecipeQualityError('Adaptation changed the approved base structure or identity.', 'policy_violation', 502);
  const remaining = original.ingredients.map(ingredientIdentity);
  let substitutions = 0;
  for (const ingredient of recipe.ingredients) {
    const index = remaining.indexOf(ingredientIdentity(ingredient));
    if (index >= 0) remaining.splice(index, 1);
    else {
      substitutions++;
      if (!swapAllowed(ingredient, base)) throw new RecipeQualityError('Ingredient replacement is outside the approved swap policy.', 'policy_violation', 502);
    }
  }
  const portionRatio = recipe.servings / original.servings;
  if (portionRatio !== 1 && original.cookMinutes > 0 && recipe.cookMinutes !== original.cookMinutes
    && Math.abs(recipe.cookMinutes - original.cookMinutes * portionRatio) < 0.01)
    throw new RecipeQualityError('Cooking time cannot scale linearly with portions.', 'policy_violation', 502);
  let quantityChanges = 0;
  const replaced = original.ingredients.filter((i) => remaining.includes(ingredientIdentity(i)));
  let replacementIndex = 0;
  for (const ingredient of recipe.ingredients) {
    const originalIngredient = original.ingredients.find((i) => ingredientIdentity(i) === ingredientIdentity(ingredient));
    if (!originalIngredient) {
      const removed = replaced[replacementIndex++];
      const ratio = removed && ingredient.grams! / (removed.grams! * portionRatio);
      if (!ratio || ratio < 0.8 || ratio > 1.2)
        throw new RecipeQualityError('Replacement ingredient amounts must stay within 20% of the removed portion weight.', 'policy_violation', 502);
      continue;
    }
    const expected = originalIngredient.grams! * portionRatio;
    const gramsRatio = ingredient.grams! / expected;
    if (Math.abs(ingredient.grams! - expected) > Math.max(0.01, expected * 0.01)) quantityChanges++;
    if (gramsRatio < 0.8 || gramsRatio > 1.2)
      throw new RecipeQualityError('Retained ingredient amounts must scale with servings; nonuniform changes are capped at 20%.', 'policy_violation', 502);
    const beforeUnit = resolveUnit(originalIngredient.unit);
    const afterUnit = resolveUnit(ingredient.unit);
    if (beforeUnit.dim !== afterUnit.dim || beforeUnit.dim === 'count' && beforeUnit.canonical !== afterUnit.canonical)
      throw new RecipeQualityError('Retained ingredients must preserve compatible measurement units.', 'policy_violation', 502);
    const quantityRatio = ingredient.quantity! * afterUnit.factor / (originalIngredient.quantity! * beforeUnit.factor * portionRatio);
    if (Math.abs(quantityRatio - gramsRatio) > 0.02)
      throw new RecipeQualityError('Ingredient quantities and weights must scale consistently with servings.', 'policy_violation', 502);
  }
  if (!Number.isInteger(base.adaptation_policy.maxSubstitutions) || base.adaptation_policy.maxSubstitutions < 0
    || substitutions + quantityChanges > base.adaptation_policy.maxSubstitutions)
    throw new RecipeQualityError('Too many substitutions or nonuniform quantity changes for this approved base.', 'policy_violation', 502);
  return structuredClone(recipe);
}

async function boundedModel(model: RecipeModel, system: string, context: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([model(system, context), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RecipeQualityError('Recipe model timed out.', 'model_timeout', 504)), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Pure orchestration: no base mutations, no hidden retries and no paid calls without a reservation. */
export async function suggestRecipe(options: SuggestRecipeOptions): Promise<QualityResult> {
  const approved = options.bases.filter((b) => b.status === 'approved' && isQualityRecipe(b.recipe)
    && computeRecipeNutrition(b.recipe.ingredients, b.recipe.servings).complete);
  const preferred = options.constraints.preferredCuisines ?? [];
  const rank = (b: BaseVersion) => {
    const index = preferred.indexOf(b.recipe.cuisine);
    return (index >= 0 ? 1000 - index * 20 : 0)
      - (options.constraints.weeknight ? b.recipe.ingredients.length * 5 + b.recipe.prepMinutes + b.recipe.cookMinutes : 0);
  };
  const compatible = approved.filter((b) => checkRecipe(b.recipe, options.constraints).valid)
    .sort((a, b) => rank(b) - rank(a));
  const base = options.baseVersionId ? approved.find((b) => b.id === options.baseVersionId) : compatible[0];
  const fallbackBase = compatible.find((b) => b.id === base?.id) ?? compatible[0];
  if (!base || !fallbackBase) throw new RecipeQualityError('No compatible approved base recipe is available for these restrictions and limits. Change the request or add a compatible tested base.', 'no_compatible_base', 422);
  const fallback = (reason: string, attempts: RecipeAttempt[]): QualityResult => ({
    baseVersionId: fallbackBase.id, recipe: structuredClone(fallbackBase.recipe), disposition: 'fallback', attempts,
    reviewNote: `${reason.slice(0, 350)} Returned an unchanged compatible approved recipe. Check ingredient labels; this is not allergy certification.`,
    changes: [], promptVersion: CHEF_REVIEW_PROMPT_VERSION,
  });
  if (!options.enabled) return fallback(options.disabledReason ?? 'Live recipe AI is disabled; no model request was made.', []);
  if (!options.model || !options.reserve) return fallback('Recipe AI or its durable request budget is unavailable; no model request was made.', []);
  const catalog = canonicalCatalog(approved, base);
  let failure = 'The recipe could not pass review.';
  const attempts: RecipeAttempt[] = [];
  for (const attempt of [1, 2] as const) {
    let stage: RecipeAttempt['stage'] = 'adapt';
    try {
      if (!await options.reserve('adapt', attempt)) return fallback('The recipe AI request limit was reached; no further model request was made.', attempts);
      const candidate = validateAdaptation(await boundedModel(options.model, RECIPE_ADAPT_SYSTEM, {
        base: base.recipe, adaptationPolicy: base.adaptation_policy, canonicalIngredients: catalog,
        constraints: options.constraints, safetyReferences: RECIPE_SAFETY_REFERENCES,
        previousFailure: attempt === 2 ? failure.slice(0, 1200) : null,
      }, options.timeoutMs ?? 25000), base, catalog, options.constraints);
      attempts.push({ attempt, stage, outcome: 'accepted', issues: checkRecipe(candidate, options.constraints, catalog).issues, promptVersion: CHEF_REVIEW_PROMPT_VERSION });
      if (!await options.reserve('review', attempt)) return fallback('The recipe AI review limit was reached; the unreviewed candidate was not used.', attempts);
      stage = 'review';
      const review = parseChefReview(await boundedModel(options.model, CHEF_REVIEW_SYSTEM, {
        base: base.recipe, adaptationPolicy: base.adaptation_policy, canonicalIngredients: catalog,
        candidate, constraints: options.constraints, deterministicChecks: checkRecipe(candidate, options.constraints, catalog).issues,
        safetyReferences: RECIPE_SAFETY_REFERENCES, promptVersion: CHEF_REVIEW_PROMPT_VERSION,
      }, options.timeoutMs ?? 25000));
      if (review.decision === 'reject') {
        attempts.push({ attempt, stage, outcome: 'rejected', issues: review.issues, promptVersion: CHEF_REVIEW_PROMPT_VERSION });
        failure = `Chef review rejected the candidate: ${review.note}`; continue;
      }
      const result = review.decision === 'fix'
        ? validateAdaptation(review.corrected_recipe, base, catalog, options.constraints) : candidate;
      const unchanged = stableRecipeJson(result) === stableRecipeJson(base.recipe);
      attempts.push({ attempt, stage, outcome: 'accepted', issues: review.issues, promptVersion: CHEF_REVIEW_PROMPT_VERSION });
      const changes = unchanged ? [] : [
        { path: 'recipe', reason: 'Adapted a private copy of the approved base within its policy.' },
        ...review.changes,
      ];
      return {
        baseVersionId: base.id, recipe: result, disposition: unchanged ? 'tested' : 'adapted',
        attempts, reviewNote: `${review.note} Written-recipe review only; not physically tasted or allergy certified.`.slice(0, 600),
        changes, promptVersion: CHEF_REVIEW_PROMPT_VERSION,
      };
    } catch (error) {
      failure = error instanceof RecipeQualityError ? error.message : 'Recipe AI returned malformed data or was unavailable.';
      attempts.push({
        attempt, stage, outcome: error instanceof RecipeQualityError && /timeout|unavailable/.test(error.code) ? 'unavailable' : 'invalid',
        issues: [{ category: 'scope', severity: 'blocking', detail: failure.slice(0, 1000) }],
        promptVersion: CHEF_REVIEW_PROMPT_VERSION,
      });
    }
  }
  return fallback(`${failure} The bounded retry was exhausted.`, attempts);
}
