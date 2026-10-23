import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECIPE_MEAL_TYPES, STARTER_RECIPES, starterRecipeDraft } from '../library';

describe('starter recipe library', () => {
  it('has twelve unique recipes, three for each meal type, with complete instructions', () => {
    assert.equal(STARTER_RECIPES.length, 12);
    assert.equal(new Set(STARTER_RECIPES.map((x) => x.id)).size, 12);
    for (const meal of RECIPE_MEAL_TYPES) assert.equal(STARTER_RECIPES.filter((x) => x.meal === meal).length, 3);
    for (const recipe of STARTER_RECIPES) {
      assert.ok(recipe.title && recipe.description && recipe.ingredients.length >= 3 && recipe.steps.length >= 2);
      assert.ok(recipe.servings > 0 && recipe.prepMinutes >= 0 && recipe.cookMinutes >= 0);
      const draft = starterRecipeDraft(recipe);
      assert.equal(draft.title, recipe.title);
      assert.equal(draft.servings, recipe.servings);
      assert.deepEqual(draft.ingredients.map((x) => x.position), recipe.ingredients.map((_, i) => i));
      assert.deepEqual(draft.steps.map((x) => x.text), recipe.steps);
      assert.ok(draft.ingredients.every((x) => x.match_status === 'unmatched' && x.nutrition === null));
      assert.equal(draft.id, undefined);
      assert.equal(draft.sourceUrl, null);
    }
  });
  it('makes private editable copies without changing the source or another draft', () => {
    const original = STARTER_RECIPES[0];
    const draft = starterRecipeDraft(original);
    draft.title = 'My breakfast';
    draft.ingredients[0].raw_text = '1 cup oats';
    draft.steps[0].text = 'My first step';
    const next = starterRecipeDraft(original);
    assert.equal(next.title, original.title);
    assert.equal(next.ingredients[0].raw_text, original.ingredients[0]);
    assert.equal(next.steps[0].text, original.steps[0]);
  });
  it('keeps detected cooking timers in copied steps', () => {
    const oats = starterRecipeDraft(STARTER_RECIPES[0]);
    assert.equal(oats.steps[1].timer_seconds, 300);
  });
});
