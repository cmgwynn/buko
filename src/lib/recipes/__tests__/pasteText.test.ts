import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { draftFromPastedRecipe, recipeToDraft, type PastedRecipeInput } from '../pasteText';
import { importRecipeFromHtml } from '../importer';

const input: PastedRecipeInput = {
  title: '  Lentil soup  ',
  servings: '2',
  ingredients: '• 1 cup lentils\r\n- 2 cups water\r\n\r\n',
  steps: '1. Combine lentils\r\nand water.\r\n\r\n2. Simmer for 20 minutes.',
  sourceUrl: 'example.com/my-recipe',
};

describe('pasted recipe draft', () => {
  it('uses ingredient parsing and timers, preserving paragraphs and source attribution', () => {
    const draft = draftFromPastedRecipe(input);
    assert.equal(draft.title, 'Lentil soup');
    assert.equal(draft.servings, 2);
    assert.equal(draft.servingsGuessed, false);
    assert.equal(draft.ingredients.length, 2);
    assert.equal(draft.ingredients[0].raw_text, '1 cup lentils');
    assert.equal(draft.ingredients[0].quantity, 1);
    assert.equal(draft.ingredients[0].name, 'lentils');
    assert.equal(draft.ingredients[0].match_status, 'unmatched');
    assert.deepEqual(draft.steps, [
      { position: 0, text: 'Combine lentils and water.', timer_seconds: null },
      { position: 1, text: 'Simmer for 20 minutes.', timer_seconds: 1200 },
    ]);
    assert.equal(draft.sourceUrl, 'https://example.com/my-recipe');
    assert.equal(draft.sourceName, 'example.com');
    assert.equal(draft.photoPath, null);
    assert.equal(draft.photoUri, null);
  });
  it('works offline without a URL and defaults an unspecified yield for review', () => {
    const draft = draftFromPastedRecipe({ ...input, servings: '', sourceUrl: '', sourceName: 'Grandma' });
    assert.equal(draft.servings, 4);
    assert.equal(draft.servingsGuessed, true);
    assert.equal(draft.sourceUrl, null);
    assert.equal(draft.sourceName, 'Grandma');
    assert.equal(draftFromPastedRecipe({ ...input, sourceUrl: '' }).sourceName, null);
  });
  it('preserves fractional quantities and punctuation rather than splitting sentences into steps', () => {
    const draft = draftFromPastedRecipe({ ...input, ingredients: '1/2 cup rice\n½ tsp salt', steps: 'Heat to 180.5 degrees. Stir.\nKeep stirring.\n\nRest for 5-10 minutes.' });
    assert.equal(draft.ingredients[0].quantity, 0.5);
    assert.equal(draft.ingredients[1].quantity, 0.5);
    assert.equal(draft.steps.length, 2);
    assert.equal(draft.steps[1].timer_seconds, 600);
  });
  for (const [patch, message] of [
    [{ title: ' ' }, /title/],
    [{ ingredients: '\n• \n- ' }, /ingredient/],
    [{ steps: '\r\n ' }, /instruction/],
    [{ servings: '0' }, /serving count/],
    [{ servings: '101' }, /serving count/],
    [{ servings: '2.5' }, /serving count/],
    [{ servings: 'two' }, /serving count/],
    [{ sourceUrl: 'javascript:alert(1)' }, /http and https/],
    [{ sourceUrl: 'https://user:pass@example.com/' }, /username or password/],
    [{ ingredients: 'x'.repeat(100_001) }, /too long/],
  ] as const) {
    it(`validates ${Object.keys(patch)[0]} before creating a draft`, () => {
      assert.throws(() => draftFromPastedRecipe({ ...input, ...patch }), message);
    });
  }
  it('shares draft conversion with structured URL and saved-page imports', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe', name: 'Soup', recipeIngredient: ['2 cups water'],
      recipeInstructions: ['Boil for 10 minutes.'], recipeYield: '3 servings',
    })}</script>`;
    const draft = recipeToDraft(importRecipeFromHtml(html, 'https://www.allrecipes.com/recipe/1'));
    assert.equal(draft.title, 'Soup');
    assert.equal(draft.servings, 3);
    assert.equal(draft.sourceName, 'allrecipes.com');
    assert.equal(draft.ingredients[0].quantity, 2);
    assert.equal(draft.steps[0].timer_seconds, 600);
  });
});
