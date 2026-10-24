import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RecipePhotoSaveError, recipeSavePayload, savePrivateRecipe, type RecipeSaveDependencies } from '../saving';
import type { RecipeDraft } from '../types';

const draft = (): RecipeDraft => ({
  title: '  Soup  ', servings: 2, prepMinutes: 5, cookMinutes: 10, sourceUrl: null,
  sourceName: null, photoPath: null, photoUri: null,
  ingredients: [{
    position: 99, raw_text: '100 g carrots', name: 'carrots', quantity: 100, unit: 'g',
    grams: 100, food_source: null, food_source_id: null, nutrition: null,
    section: 'produce', match_status: 'unmatched',
  }],
  steps: [{ position: 99, text: ' Simmer for 10 minutes. ', timer_seconds: null }],
});

function fixture() {
  const payloads: ReturnType<typeof recipeSavePayload>[] = [];
  const photos: string[] = [];
  const deps: RecipeSaveDependencies = {
    save: async (payload) => { payloads.push(payload); return { id: payload.p_recipe.id ?? 'new-id', error: null }; },
    uploadPhoto: async (_owner, id) => { photos.push(`upload:${id}`); return 'alice/photo.jpg'; },
    setPhoto: async (_owner, id) => { photos.push(`update:${id}`); },
  };
  return { deps, payloads, photos };
}

describe('transactional private recipe saves', () => {
  it('sends one atomic replacement with existing ID, without child IDs or owner metadata', async () => {
    const f = fixture();
    const d = { ...draft(), id: 'existing-id' };
    assert.equal(await savePrivateRecipe(f.deps, 'alice', d), 'existing-id');
    assert.equal(f.payloads.length, 1);
    const payload = f.payloads[0];
    assert.equal(payload.p_recipe.id, 'existing-id');
    assert.equal(payload.p_recipe.expected_user_id, 'alice');
    assert.equal(payload.p_recipe.title, 'Soup');
    assert.equal(payload.p_steps[0].timer_seconds, 600);
    assert.equal(payload.p_steps[0].text, 'Simmer for 10 minutes.');
    assert.equal('id' in payload.p_ingredients[0], false);
    assert.equal('recipe_id' in payload.p_ingredients[0], false);
    assert.equal('user_id' in payload.p_ingredients[0], false);
    assert.equal('position' in payload.p_ingredients[0], false);
    assert.deepEqual(f.photos, []);
    assert.equal(d.ingredients[0].position, 99);
  });

  it('requires migration 0010 when the RPC is absent; it never falls back to destructive replacements', async () => {
    const f = fixture();
    f.deps.save = async () => ({ id: null, error: { code: 'PGRST202', message: 'function absent' } });
    await assert.rejects(savePrivateRecipe(f.deps, 'alice', draft()), /0010_ux_workflows.sql.*draft is kept/);
    assert.deepEqual(f.photos, []);
  });

  it('surfaces transaction failures and does not attempt photos or claim success', async () => {
    const f = fixture();
    f.deps.save = async () => ({ id: null, error: { message: 'Recipe unavailable' } });
    await assert.rejects(savePrivateRecipe(f.deps, 'alice', { ...draft(), photoUri: 'file:photo' }), /Recipe unavailable/);
    assert.deepEqual(f.photos, []);
  });

  it('binds a new recipe request to the expected account rather than whichever token is current later', async () => {
    const f = fixture();
    f.deps.save = async (payload) => {
      assert.equal(payload.p_recipe.expected_user_id, 'alice');
      return { id: null, error: { message: 'The signed-in account changed' } };
    };
    await assert.rejects(savePrivateRecipe(f.deps, 'alice', draft()), /account changed/);
  });

  it('returns the saved ID on photo upload failure so an editor retry cannot duplicate the recipe', async () => {
    const f = fixture();
    f.deps.uploadPhoto = async () => { throw new Error('upload offline'); };
    const d = { ...draft(), photoUri: 'file:photo' };
    try {
      await savePrivateRecipe(f.deps, 'alice', d);
      assert.fail('Photo failure must be explicit');
    } catch (error) {
      assert.ok(error instanceof RecipePhotoSaveError);
      assert.equal(error.recipeId, 'new-id');
      assert.match(error.message, /recipe was saved.*photo was not/);
      d.id = error.recipeId;
    }
    f.deps.uploadPhoto = async () => 'alice/photo.jpg';
    assert.equal(await savePrivateRecipe(f.deps, 'alice', d), 'new-id');
    assert.equal(f.payloads[1].p_recipe.id, 'new-id');
  });

  it('checks photo path update failures as carefully as upload failures', async () => {
    const f = fixture();
    f.deps.setPhoto = async () => { throw new Error('photo path update failed'); };
    await assert.rejects(savePrivateRecipe(f.deps, 'alice', { ...draft(), photoUri: 'file:photo' }), (error: unknown) => {
      assert.ok(error instanceof RecipePhotoSaveError);
      assert.equal(error.recipeId, 'new-id');
      assert.match(error.message, /photo path update failed/);
      return true;
    });
  });
});
