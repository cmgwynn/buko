import { Platform } from 'react-native';
import { toDateString } from '../diary';
import { supabase } from '../supabase';
import type { UserSettings } from '../fitness/types';
import { healthConnectAdapter } from './android';
import { healthKitAdapter } from './ios';
import type { ActivityHint, HealthAdapter, HealthFeature } from './types';
import { checkHealthAccess } from '../billing/client';
import { invalidateDateHistory } from '../../components/date/dateHistory';

export type { HealthFeature } from './types';

export function getAdapter(): HealthAdapter | null {
  if (Platform.OS === 'ios') return healthKitAdapter;
  if (Platform.OS === 'android') return healthConnectAdapter;
  return null;
}

export const healthAppName = () => (Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect');

/**
 * What each switch does and why it needs permission. Shown to the user BEFORE the system prompt, and the
 * prompt is only ever triggered by turning that one switch on.
 */
export const FEATURES: { key: HealthFeature; setting: keyof UserSettings; title: string; why: string }[] = [
  { key: 'read_steps', setting: 'health_read_steps', title: 'Read steps', why: 'Shows your daily step count on the Train tab. Nothing else is read.' },
  {
    key: 'read_active_energy', setting: 'health_read_active_energy', title: 'Read active calories',
    why: 'Lets Buko add calories you burned to your daily target when “Adjust for activity” is on. Without it, Buko only counts workouts you log here.',
  },
  { key: 'read_workouts', setting: 'health_read_workouts', title: 'Read workouts', why: 'Brings workouts recorded by your watch or other apps into your Buko history.' },
  { key: 'write_workouts', setting: 'health_write_workouts', title: 'Save workouts to Health', why: 'Copies workouts you log in Buko into your health app so your records there stay complete.' },
  { key: 'write_nutrition', setting: 'health_write_nutrition', title: 'Save food to Health', why: 'Copies the calories and macros you log in the diary into your health app.' },
];

/** Pick the closest activity type for a workout, from its exercises. */
export function activityHintFor(exercises: { name: string; category: 'strength' | 'cardio' }[]): ActivityHint {
  const cardio = exercises.filter((e) => e.category === 'cardio');
  if (cardio.length === 0) return 'strength';
  const n = cardio[0].name.toLowerCase();
  if (/run|jog|treadmill/.test(n)) return 'running';
  if (/walk/.test(n)) return 'walking';
  if (/cycl|bike|biking/.test(n)) return 'cycling';
  return 'other';
}

async function loadSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase.from('user_settings').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UserSettings | null) ?? null;
}

/** Legacy direct-write API. Stable native identifiers make receipt-sync retries duplicate-resistant. */
export async function syncWorkoutToHealth(w: {
  id: string; name: string; startedAt: Date; durationMin: number; calories: number | null; hint?: ActivityHint; distanceM?: number | null;
}): Promise<void> {
  const settings = await loadSettings();
  if (!settings?.health_write_workouts) return;
  if (!await checkHealthAccess()) return;
  const a = getAdapter();
  if (!a || !(await a.isAvailable())) return;
  const existing = await supabase.from('workouts').select('exported_external_id').eq('id', w.id).single();
  if (existing.error) throw new Error(`Could not check the workout’s Health export: ${existing.error.message}`);
  if (existing.data.exported_external_id) return;
  const end = new Date(w.startedAt.getTime() + w.durationMin * 60000);
  const id = await a.writeWorkout({
    clientId: w.id,
    name: w.name, start: w.startedAt, end, calories: w.calories,
    distanceM: w.distanceM ?? null, hint: w.hint ?? 'strength',
  });
  if (!id) throw new Error('The health app did not confirm a saved workout.');
  const saved = await supabase.from('workouts').update({ exported_external_id: id }).eq('id', w.id).select('id').single();
  if (saved.error) throw new Error(`The workout reached Health, but its confirmation could not sync. Retry safely using the same workout ID: ${saved.error.message}`);
}

export async function removeWorkoutFromHealth(exportedId: string | null): Promise<void> {
  const a = getAdapter();
  if (!exportedId || !a || !(await a.isAvailable())) return;
  await a.deleteWorkout(exportedId).catch(() => {});
}

export type NutritionWriteResult = 'written' | 'disabled' | 'failed';
const nutritionWrites = new Map<string, Promise<NutritionWriteResult>>();
/** If "save food to Health" is on, copy one diary entry across without duplicating its linked sample. */
export function maybeWriteNutrition(entryId: string): Promise<NutritionWriteResult> {
  const pending = nutritionWrites.get(entryId);
  if (pending) return pending;
  const write = writeNutrition(entryId).finally(() => { nutritionWrites.delete(entryId); });
  nutritionWrites.set(entryId, write);
  return write;
}
async function writeNutrition(entryId: string): Promise<NutritionWriteResult> {
  try {
    const s = await loadSettings();
    const a = getAdapter();
    if (!s?.health_write_nutrition) return 'disabled';
    if (!a || !(await a.isAvailable()) || !await checkHealthAccess()) return 'failed';
    const { data, error } = await supabase.from('food_log_entries').select('name, calories, protein_g, carbs_g, fat_g, logged_on, created_at, health_external_id').eq('id', entryId).single();
    if (error || !data) return 'failed';
    if (data.health_external_id) return 'written';
    const e = data as { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; logged_on: string; created_at: string };
    // Use now for today's entries so the sample sits at a sensible time; noon for other days.
    const at = e.logged_on === toDateString(new Date()) ? new Date() : new Date(`${e.logged_on}T12:00:00`);
    const id = await a.writeNutrition({ name: e.name, at, calories: Number(e.calories), protein_g: Number(e.protein_g), carbs_g: Number(e.carbs_g), fat_g: Number(e.fat_g) });
    if (!id) return 'failed';
    const saved = await supabase.from('food_log_entries').update({ health_external_id: id }).eq('id', entryId);
    if (saved.error) {
      await a.deleteNutrition(id);
      return 'failed';
    }
    return 'written';
  } catch {
    return 'failed';
  }
}

export type HealthRemoval = 'removed' | 'none' | 'failed';

/**
 * Remove a mirrored nutrition sample. Never throws; reports 'failed' when the linked sample may
 * still exist in the health app so callers can avoid writing a duplicate copy.
 */
export async function removeNutritionFromHealth(externalId: string | null): Promise<HealthRemoval> {
  const a = getAdapter();
  if (!externalId) return 'none';
  if (!a) return 'failed';
  try {
    if (!(await a.isAvailable())) return 'failed';
    await a.deleteNutrition(externalId);
    return 'removed';
  } catch {
    return 'failed';
  }
}

/**
 * Pull the last few days of steps / active energy and recent workouts from the health app into Supabase.
 * Only the switches that are on are read. Imported workouts are de-duplicated by their id in the health app.
 */
export async function syncFromHealth(userId: string, s: UserSettings): Promise<void> {
  const a = getAdapter();
  const wantSteps = s.health_read_steps;
  const wantEnergy = s.health_read_active_energy;
  if (!a || !(wantSteps || wantEnergy || s.health_read_workouts) || !(await a.isAvailable())) return;
  if (!await checkHealthAccess()) return;

  if (wantSteps || wantEnergy) {
    for (let back = 0; back < 3; back++) {
      const day = new Date();
      day.setDate(day.getDate() - back);
      const r = await a.readDay(day, { steps: wantSteps, activeEnergy: wantEnergy });
      const row: Record<string, unknown> = { user_id: userId, day: toDateString(day), source: a.platform, updated_at: new Date().toISOString() };
      if (r.steps != null) row.steps = r.steps;
      if (r.activeKcal != null) row.active_kcal = r.activeKcal;
      await supabase.from('daily_activity').upsert(row, { onConflict: 'user_id,day' });
    }
  }

  if (s.health_read_workouts) {
    const since = new Date(Date.now() - 14 * 86400000);
    const found = await a.readWorkouts(since);
    if (found.length) {
      const { data } = await supabase.from('workouts').select('external_id').eq('source', a.platform).in('external_id', found.map((f) => f.externalId));
      const have = new Set(((data as { external_id: string }[] | null) ?? []).map((r) => r.external_id));
      const fresh = found.filter((f) => !have.has(f.externalId));
      if (fresh.length) {
        const saved = await supabase.from('workouts').insert(
          fresh.map((f) => ({
            user_id: userId,
            name: f.name,
            started_at: f.start.toISOString(),
            duration_min: f.durationMin,
            calories_burned: f.calories,
            calories_estimated: false,
            source: a.platform,
            external_id: f.externalId,
          })),
        );
        if (saved.error) throw new Error(`Could not import health workouts: ${saved.error.message}`);
        invalidateDateHistory();
      }
    }
  }
}

export async function loadActivityForDay(day: string): Promise<{ steps: number | null; active_kcal: number | null } | null> {
  const { data } = await supabase.from('daily_activity').select('steps, active_kcal').eq('day', day).maybeSingle();
  return (data as { steps: number | null; active_kcal: number | null } | null) ?? null;
}

let lastSync = 0;
/** Sync at most once every two minutes, so moving between tabs does not hammer the health app. */
export async function syncIfDue(userId: string, s: UserSettings | null, force = false): Promise<boolean> {
  if (!s || (Date.now() - lastSync < 120000 && !force)) return false;
  lastSync = Date.now();
  try {
    await syncFromHealth(userId, s);
    return true;
  } catch {
    return false;
  }
}
