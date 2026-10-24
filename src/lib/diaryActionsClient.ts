import { supabase } from './supabase';
import { maybeWriteNutrition, removeNutritionFromHealth } from './health';
import { toDateString } from './diary';
import type { DiaryTransferInput, DiaryTransferResult, FoodFavorite } from './diaryActions';
import { invalidateDateHistory } from '../components/date/dateHistory';
import type { FoodLogEntry } from '../types';
import { planDayCopy } from './diaryActions';
import { sumEntries } from './foodLogging';

export async function diaryRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42P01'
    ? 'Diary quick actions need database migration 0012. Your logged food is unchanged.'
    : error.message);
  return data as T;
}
export async function loadFoodFavorites(): Promise<FoodFavorite[]> {
  const { data, error } = await supabase.from('food_favorites').select('*').order('updated_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205'
    ? 'Food favorites need database migration 0012.' : error.message);
  return data as FoodFavorite[];
}
export async function transferDiary(userId: string, requestId: string, input: DiaryTransferInput) {
  const result = await diaryRpc<DiaryTransferResult>('diary_transfer', {
    p_request_id: requestId, p_expected_user_id: userId, p_mode: input.mode, p_target_date: input.targetDate,
    p_today: toDateString(new Date()), p_entry: input.mode === 'day' ? null : input.entryId,
    p_source_date: input.mode === 'day' ? input.sourceDate : null,
    p_target_meal: input.mode === 'day' ? null : input.targetMeal,
  });
  invalidateDateHistory();
  return result;
}
export async function previewDayCopy(userId: string, sourceDate: string, targetDate: string) {
  if (sourceDate === targetDate) throw new Error('Choose a different destination date.');
  const [source, target] = await Promise.all([
    supabase.from('food_log_entries').select('*').eq('user_id', userId).eq('logged_on', sourceDate).order('created_at'),
    supabase.from('food_log_entries').select('*').eq('user_id', userId).eq('logged_on', targetDate).order('created_at'),
  ]);
  if (source.error || target.error) throw new Error(`Could not preview this copy: ${source.error?.message ?? target.error?.message}`);
  if (!source.data.length) throw new Error('There is no logged food on the source day.');
  const result = planDayCopy(source.data as FoodLogEntry[], target.data as FoodLogEntry[]);
  const names = result.toAdd.slice(0, 20).map((entry) => `${entry.name} (${Math.round(entry.grams)} g)`).join(', ');
  return `Add ${result.toAdd.length} food entries (${Math.round(sumEntries(result.toAdd).calories)} kcal) to ${targetDate}, keeping their meal slots. ${names}${result.toAdd.length > 20 ? ', and more' : ''}. Existing entries stay; ${result.duplicates.length} matching portions will be skipped. The server rechecks before saving.`;
}

/** Buko changes are already committed. Keep old health links until deletion is confirmed. */
export async function mirrorDiaryTransfer(result: DiaryTransferResult): Promise<string | null> {
  const warnings: string[] = [];
  for (const entry of result.entries) {
    const current = await supabase.from('food_log_entries').select('id,health_external_id').eq('id', entry.id).maybeSingle();
    if (current.error || !current.data) {
      warnings.push(`Food saved in Buko, but its health copy could not be checked: ${current.error?.message ?? 'entry unavailable'}`);
      continue;
    }
    if (current.data.health_external_id && current.data.health_external_id !== entry.health_external_id) continue;
    if (entry.health_external_id) {
      const status = await removeNutritionFromHealth(entry.health_external_id);
      if (status === 'failed') {
        warnings.push('A moved food could not be updated in your health app. Its old link is kept; remove the old sample there before exporting it again.');
        continue;
      }
      const updated = await supabase.from('food_log_entries').update({ health_external_id: null }).eq('id', entry.id).eq('health_external_id', entry.health_external_id);
      if (updated.error) {
        warnings.push(`Food moved, but its health link could not be cleared: ${updated.error.message}`);
        continue;
      }
    }
    const status = await maybeWriteNutrition(entry.id);
    if (status === 'failed') warnings.push('Food saved in Buko, but could not be copied to your health app. Check health permissions and your connection.');
  }
  return warnings.length ? [...new Set(warnings)].join(' ') : null;
}
