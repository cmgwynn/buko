import { config } from '../config';
import { supabase } from '../supabase';
import type { CoachAction, CoachPreferences, CoachReply, WeeklyFacts } from './types';
export function coachSetupError(message: string, code?: string): string {
  return code === '42P01' || code === 'PGRST205' || /could not find.*coach_/i.test(message)
    ? 'Coach setup is not complete. The app owner needs to run migration 0005 and deploy the coach Edge Function. Your existing Buko features are unchanged.'
    : message;
}
export async function coachRequest<T>(operation: string, today: string, message?: string): Promise<T> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!session) throw new Error('Please log in to use the coach.');
  const response = await fetch(`${config.supabaseUrl}/functions/v1/coach`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, today, message }), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error('Coach Edge Function is not deployed yet. Ask the app owner to complete Coach setup.');
    const data: unknown = await response.json().catch(() => null);
    const text = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Coach request failed. Please retry later.';
    throw new Error(text);
  }
  return await response.json() as T;
}
export async function loadCoachPreferences(): Promise<CoachPreferences | null> {
  const { data, error } = await supabase.from('coach_preferences').select('user_id,consent_version,focus,include_weight').maybeSingle();
  if (error) throw new Error(coachSetupError(error.message, error.code));
  return data as CoachPreferences | null;
}
export async function saveCoachPreferences(preferences: CoachPreferences): Promise<void> {
  const { error } = await supabase.from('coach_preferences').upsert({ ...preferences, updated_at: new Date().toISOString() });
  if (error) throw new Error(coachSetupError(error.message, error.code));
}
export async function loadCoachHistory(): Promise<CoachReply[]> {
  const { data, error } = await supabase.from('coach_replies')
    .select('id,kind,text,suggestions,facts,safety,actions:coach_actions(id,kind,title,detail,applied_at)')
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(coachSetupError(error.message, error.code));
  return (data as CoachReply[]).reverse();
}
export async function applyCoachAction(action: CoachAction, day: string, meal: string, servings: number): Promise<void> {
  const { error } = await supabase.rpc('apply_coach_action', { p_action_id: action.id, p_day: day, p_meal: meal, p_servings: servings });
  if (error) throw new Error(error.message);
}
export async function clearCoachHistory(): Promise<void> {
  const { error } = await supabase.rpc('clear_coach_history');
  if (error) throw new Error(error.message);
}
export type CoachSummary = { facts: WeeklyFacts; enabled: boolean };
