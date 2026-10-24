import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../supabase';
import type { RecipeDraft } from './draft';
import { clearDraft, getDraft } from './draft';
import { savePrivateRecipe } from './saving';
export { RecipePhotoSaveError } from './saving';
import type { IngredientDraft, Recipe, RecipeIngredient, RecipeStep } from './types';

export interface RecipeFull {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export async function loadRecipe(id: string): Promise<RecipeFull> {
  const [r, i, s] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', id).single(),
    supabase.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position'),
    supabase.from('recipe_steps').select('*').eq('recipe_id', id).order('position'),
  ]);
  if (r.error) throw new Error(r.error.message);
  if (i.error) throw new Error(i.error.message);
  if (s.error) throw new Error(s.error.message);
  return { recipe: r.data as Recipe, ingredients: i.data as RecipeIngredient[], steps: s.data as RecipeStep[] };
}

export function draftFromFull(full: RecipeFull): RecipeDraft {
  const { recipe } = full;
  return {
    id: recipe.id,
    communityParentId: recipe.community_parent_id,
    title: recipe.title,
    servings: recipe.servings,
    prepMinutes: recipe.prep_minutes,
    cookMinutes: recipe.cook_minutes,
    sourceUrl: recipe.source_url,
    sourceName: recipe.source_name,
    photoPath: recipe.photo_path,
    photoUri: null,
    ingredients: full.ingredients.map(({ id: _id, recipe_id: _r, user_id: _u, ...rest }) => rest as IngredientDraft),
    steps: full.steps.map((s) => ({ position: s.position, text: s.text, timer_seconds: s.timer_seconds })),
  };
}

/** Insert or update a recipe with its ingredients and steps; returns the recipe id. */
export async function saveRecipe(userId: string, d: RecipeDraft): Promise<string> {
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id !== userId) throw new Error('The signed-in account changed. Reopen this recipe and try again.');
  return savePrivateRecipe({
    save: async (payload) => {
      const { data, error } = await supabase.rpc('save_private_recipe', payload);
      return { id: typeof data === 'string' ? data : null, error };
    },
    uploadPhoto,
    setPhoto: async (owner, id, path) => {
      const { data, error } = await supabase.from('recipes').update({ photo_path: path }).eq('id', id).eq('user_id', owner).select('id').maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('The recipe is no longer available. It has not been recreated.');
    },
  }, userId, d);
}

export async function deleteRecipe(recipe: Recipe) {
  if (recipe.photo_path) await supabase.storage.from('recipe-photos').remove([recipe.photo_path]);
  const { error } = await supabase.from('recipes').delete().eq('id', recipe.id);
  if (error) throw new Error(error.message);
  if (getDraft().id === recipe.id) await clearDraft();
}

/** Pick one of the user's own photos (no web images). */
export async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow photo access in Settings to add a picture.');
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [4, 3] });
  return res.canceled ? null : res.assets[0].uri;
}

/** Resize to ~1200 px wide JPEG, then upload to the user's private folder. */
async function uploadPhoto(userId: string, recipeId: string, uri: string): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri).resize({ width: 1200 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
  const bytes = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${userId}/${recipeId}.jpg`;
  const { error } = await supabase.storage.from('recipe-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('recipe-photos').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
