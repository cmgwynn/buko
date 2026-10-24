import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { communityCopy, communitySnapshot, dietaryWarnings } from '../communityPolicy';
import { libraryRecipeSummary, STARTER_RECIPES, starterRecipeDraft } from '../library';

function snapshot(index = 0) {
  const d = starterRecipeDraft(STARTER_RECIPES[index]);
  return { recipe: { title: d.title, servings: d.servings, prep_minutes: d.prepMinutes, cook_minutes: d.cookMinutes,
    user_id: 'private-owner', photo_path: 'private/photo.jpg', source_url: 'https://example.test/private' }, ingredients: d.ingredients, steps: d.steps };
}
describe('community recipe snapshot policy', () => {
  it('uses exactly the existing Buko algorithm for every complete library recipe', () => {
    for (let index = 0; index < STARTER_RECIPES.length; index++) {
      const s = snapshot(index);
      const result = communitySnapshot(s.recipe, s.ingredients, s.steps);
      assert.equal(result.score, libraryRecipeSummary(STARTER_RECIPES[index]).result.score);
      assert.equal(result.calories, libraryRecipeSummary(STARTER_RECIPES[index]).nutrition.perServing.calories);
    }
  });
  it('does not turn missing ingredient weights or any missing nutrient into a green score', () => {
    for (const key of ['calories', 'protein', 'carbs', 'fat', 'sugars', 'saturatedFat', 'sodiumMg', 'fiber'] as const) {
      const s = snapshot();
      s.ingredients[0].nutrition!.per100g[key] = null;
      const result = communitySnapshot(s.recipe, s.ingredients, s.steps);
      assert.equal(result.score, null, key);
      assert.equal(result.calories, null, key);
    }
    const s = snapshot();
    s.ingredients[0].grams = null;
    assert.equal(communitySnapshot(s.recipe, s.ingredients, s.steps).score, null);
  });
  it('strips private metadata and makes independently editable, linked copies', () => {
    const s = snapshot();
    const result = communitySnapshot(s.recipe, s.ingredients.map((i) => ({ ...i, user_id: 'private-owner', recipe_id: 'private-recipe' })), s.steps);
    const serialized = JSON.stringify(result.payload);
    for (const privateValue of ['private-owner', 'private-recipe', 'private/photo.jpg', 'https://example.test/private']) assert.ok(!serialized.includes(privateValue));
    const copy = communityCopy(result.payload, 'shared-parent');
    assert.equal(copy.id, undefined);
    assert.equal(copy.communityParentId, 'shared-parent');
    assert.equal(copy.photoPath, null);
    copy.ingredients[0].nutrition!.per100g.calories = 999;
    copy.steps[0].text = 'My version';
    assert.notEqual(result.payload.ingredients[0].nutrition!.per100g.calories, 999);
    assert.notEqual(result.payload.steps[0].text, 'My version');
  });
  it('rejects impossible quantities, missing steps and unbounded text', () => {
    const s = snapshot();
    assert.throws(() => communitySnapshot({ ...s.recipe, servings: 0 }, s.ingredients, s.steps));
    assert.throws(() => communitySnapshot(s.recipe, s.ingredients, []));
    assert.throws(() => communitySnapshot({ ...s.recipe, title: 'x'.repeat(161) }, s.ingredients, s.steps));
    s.ingredients[0].grams = -1;
    assert.throws(() => communitySnapshot(s.recipe, s.ingredients, s.steps));
    s.ingredients[0].grams = 40;
    s.ingredients[0].nutrition!.per100g.sugars = Infinity;
    assert.throws(() => communitySnapshot(s.recipe, s.ingredients, s.steps));
  });
  it('warns about conflicting tags without claiming to certify absence of allergens', () => {
    const warnings = dietaryWarnings(['Vegan', 'Vegetarian', 'Gluten-free', 'Nut-free'], [{ name: 'Chicken with wheat pasta and peanuts' }]);
    assert.equal(warnings.length, 4);
    assert.ok(warnings.every((w) => w.includes('can miss')));
    assert.equal(dietaryWarnings(['Gluten-free'], [{ name: 'Rice and beans' }]).length, 0);
  });
});
