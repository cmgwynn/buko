import { supabase } from '../supabase';
import type { CommunityPayload, DietTag } from './communityPolicy';

export interface CommunityRecipe {
  id: string;
  user_id: string;
  title: string;
  description: string;
  meal: string;
  cuisine: string;
  tags: DietTag[];
  nutrition_score: number | null;
  calories: number | null;
  parent_id: string | null;
  created_at: string;
}
export interface CommunityRow extends CommunityRecipe {
  review_count: number;
  average_rating: number | null;
}
export interface CommunityReview {
  id: string; user_id: string; stars: number; body: string; updated_at: string;
}
export interface CommunityDetail {
  recipe: CommunityRecipe & { payload: CommunityPayload };
  reviews: CommunityReview[];
  myReview: CommunityReview | null;
  reviewCount: number;
  averageRating: number | null;
  variations: Pick<CommunityRecipe, 'id' | 'title' | 'nutrition_score'>[];
}
export interface CommunityReport {
  id: string; recipe_id: string | null; review_id: string | null;
  recipe_title: string; review_body: string | null; reason: string; created_at: string;
}
export async function communityRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42P01'
    ? 'Shared recipes need backend setup (migration 0009). Your private recipes are unchanged.'
    : error.message);
  return data as T;
}
export const memberLabel = (id: string) => `Member ${id.slice(0, 8)}`;

export async function publishCommunity(input: {
  recipeId: string; description: string; meal: string; cuisine: string; tags: DietTag[]; confirmRights: boolean;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('community', { body: input });
  if (error) {
    let message = 'Publishing failed. Recipe sharing needs its server function and migration 0009 deployed.';
    if ('context' in error && error.context instanceof Response) {
      const result = await error.context.json();
      if (typeof result.error === 'string') message = result.error;
    }
    throw new Error(message);
  }
  if (!data || typeof data.id !== 'string') throw new Error('Publishing returned no recipe ID. Refresh Shared recipes before retrying.');
  return data.id;
}
