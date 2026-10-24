import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterLibraryRecipes, libraryIngredientText, libraryRecipeSummary, RECIPE_CUISINES, RECIPE_MEAL_TYPES, STARTER_RECIPES, starterRecipeDraft } from '../library';
import { LIBRARY_FOODS } from '../libraryFoods';
import { computeRecipeNutrition, scoreRecipe } from '../nutrition';
import { reparse } from '../matching';

describe('starter recipe library', () => {
  it('has at least 60 unique recipes, with every meal type in all ten cuisines', () => {
    assert.ok(STARTER_RECIPES.length >= 60);
    assert.equal(new Set(STARTER_RECIPES.map((x) => x.id)).size, STARTER_RECIPES.length);
    assert.equal(new Set(STARTER_RECIPES.map((x) => x.title)).size, STARTER_RECIPES.length);
    assert.equal(RECIPE_CUISINES.length, 10);
    for (const cuisine of RECIPE_CUISINES) {
      assert.ok(STARTER_RECIPES.filter((x) => x.cuisine === cuisine).length >= 6);
      for (const meal of RECIPE_MEAL_TYPES) assert.ok(filterLibraryRecipes({ meal, cuisine }).length >= 1, `${cuisine} ${meal}`);
    }
  });
  it('has complete, independently editable instructions and matched ingredient copies', () => {
    for (const recipe of STARTER_RECIPES) {
      assert.ok(recipe.title && recipe.description && recipe.ingredients.length >= 3 && recipe.steps.length >= 2);
      assert.ok(recipe.servings > 0 && recipe.prepMinutes >= 0 && recipe.cookMinutes >= 0);
      const draft = starterRecipeDraft(recipe);
      assert.equal(draft.title, recipe.title);
      assert.equal(draft.servings, recipe.servings);
      assert.deepEqual(draft.ingredients.map((x) => x.position), recipe.ingredients.map((_, i) => i));
      assert.deepEqual(draft.steps.map((x) => x.text), recipe.steps);
      assert.ok(draft.ingredients.every((x) => x.match_status === 'matched' && x.nutrition && x.grams && x.grams > 0));
      assert.deepEqual(draft.ingredients.map((x) => x.raw_text), recipe.ingredients.map(libraryIngredientText));
      for (let i = 0; i < recipe.ingredients.length; i++) {
        assert.equal(draft.ingredients[i].grams, recipe.ingredients[i].grams);
        assert.equal(draft.ingredients[i].quantity, recipe.ingredients[i].grams);
        assert.equal(draft.ingredients[i].unit, 'g');
        assert.equal(draft.ingredients[i].food_source_id, LIBRARY_FOODS[recipe.ingredients[i].food].fdcId);
        assert.equal(draft.ingredients[i].food_source, 'usda');
      }
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
    assert.equal(next.ingredients[0].raw_text, libraryIngredientText(original.ingredients[0]));
    assert.equal(next.steps[0].text, original.steps[0]);
    const originalCalories = next.ingredients[0].nutrition!.per100g.calories;
    draft.ingredients[0].nutrition!.per100g.calories = 999;
    assert.equal(starterRecipeDraft(original).ingredients[0].nutrition!.per100g.calories, originalCalories);
  });
  it('keeps detected cooking timers in copied steps', () => {
    const oats = starterRecipeDraft(STARTER_RECIPES[0]);
    assert.equal(oats.steps[1].timer_seconds, 300);
  });
  it('uses complete public USDA records rather than zero-filling missing scoring nutrients', () => {
    for (const food of Object.values(LIBRARY_FOODS)) {
      assert.match(food.fdcId, /^\d+$/);
      assert.ok(food.description && food.category);
      for (const [key, value] of Object.entries(food.per100g)) {
        assert.ok(Number.isFinite(value) && value >= 0, `${food.fdcId} ${key}`);
      }
      assert.equal(Object.keys(food.per100g).length, 8);
    }
  });
  it('actually scores every unmodified recipe at least 75 with every ingredient counted', () => {
    for (const recipe of STARTER_RECIPES) {
      const { nutrition, result } = libraryRecipeSummary(recipe);
      assert.equal(nutrition.excluded, 0, recipe.id);
      assert.equal(nutrition.counted, recipe.ingredients.length, recipe.id);
      assert.ok(result.score !== null && result.score >= 75, `${recipe.id}: ${result.score}`);
      assert.equal(result.rating, 'excellent', recipe.id);
      assert.ok(nutrition.perServing.calories >= 100 && nutrition.perServing.calories <= 850, recipe.id);
      if (recipe.meal === 'Lunch' || recipe.meal === 'Dinner') assert.ok(nutrition.perServing.calories >= 300, recipe.id);
    }
  });
  it('recalculates edited recipes rather than preserving an assigned green badge', () => {
    const recipe = STARTER_RECIPES.find((r) => r.id === 'banana-oats')!;
    const before = libraryRecipeSummary(recipe);
    const draft = starterRecipeDraft(recipe);
    const oats = draft.ingredients[0];
    const changed = reparse(oats, `80 g ${recipe.ingredients[0].name}`);
    assert.equal(changed.grams, 80);
    assert.equal(changed.food_source_id, oats.food_source_id);
    draft.ingredients[0] = changed;
    const after = computeRecipeNutrition(draft.ingredients, draft.servings);
    assert.ok(after.perServing.calories > before.nutrition.perServing.calories);
    draft.ingredients[0] = { ...changed, nutrition: { per100g: { calories: 900, protein: 0, carbs: 50, fat: 80, saturatedFat: 70, sodiumMg: 4000, sugars: 45, fiber: 0 } }, grams: 1000 };
    const result = scoreRecipe(draft.title, computeRecipeNutrition(draft.ingredients, draft.servings));
    assert.ok(result.score !== null && result.score < 75);
  });
  it('combines meal, cuisine and case-insensitive multiword ingredient searches', () => {
    const results = filterLibraryRecipes({ meal: 'Dinner', cuisine: 'Mexican', search: '  SALMON   cabbage ' });
    assert.deepEqual(results.map((r) => r.id), ['mexican-salmon-tacos']);
    assert.deepEqual(filterLibraryRecipes({ search: 'no-such-ingredient' }), []);
    assert.equal(filterLibraryRecipes({}).length, STARTER_RECIPES.length);
    assert.equal(filterLibraryRecipes({ search: '   ' }).length, STARTER_RECIPES.length);
    assert.ok(filterLibraryRecipes({ cuisine: 'Italian' }).every((r) => r.cuisine === 'Italian'));
    assert.ok(filterLibraryRecipes({ meal: 'Snack' }).every((r) => r.meal === 'Snack'));
  });
});
