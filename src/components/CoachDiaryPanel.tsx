import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Switch, View } from 'react-native';
import { Body, Button, Card, Notice } from './ui';
import { loadCoachPreferences } from '../lib/coach/client';
import { COACH_CONSENT_VERSION } from '../lib/coach/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { spacing } from '../theme';
import type { NutritionTargets } from '../types';

export function CoachDiaryPanel({ day, today, targets }: { day: string; today: string; targets: NutritionTargets | null }) {
  const router = useRouter();
  const { session } = useAuth();
  const [complete, setComplete] = useState(false);
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    async function load() {
      try {
        const prefs = await loadCoachPreferences();
        const enabled = prefs?.consent_version === COACH_CONSENT_VERSION;
        if (live) { setConsented(enabled); setError(null); setComplete(false); }
        if (!enabled || !session) return;
        const { data, error: e } = await supabase.from('coach_days').select('complete').eq('day', day).maybeSingle();
        if (e) throw new Error(e.message);
        if (live) setComplete(Boolean(data?.complete));
        if (day === today && targets) {
          const { error: snapshotError } = await supabase.from('coach_target_snapshots').upsert({
            user_id: session.user.id, day, calories: targets.calories,
            protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g,
          }, { onConflict: 'user_id,day' });
          if (snapshotError) throw new Error(snapshotError.message);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Coach logging status could not be loaded.');
      }
    }
    void load();
    return () => { live = false; };
  }, [day, today, session, targets?.calories, targets?.protein_g, targets?.carbs_g, targets?.fat_g]));
  async function toggle(value: boolean) {
    if (!session || busy) return;
    setBusy(true);
    try {
      const { error: e } = await supabase.from('coach_days').upsert({ user_id: session.user.id, day, complete: value });
      if (e) throw new Error(e.message);
      setComplete(value); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update logging status.'); }
    finally { setBusy(false); }
  }
  return (
    <Card>
      <Button title="Coach & weekly review" icon="chatbubbles-outline" variant="secondary" onPress={() => router.push('/coach')} />
      {consented ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Body>Food logging complete for this day</Body><Body muted>Mark only when all meals, snacks and drinks are logged. Missing days stay unknown.</Body></View>
          <Switch accessibilityLabel="Food logging complete for this day" disabled={busy} value={complete} onValueChange={toggle} />
        </View>
      ) : <Body muted>Optional, preference-driven wellness support. Live AI stays off until configured.</Body>}
      {error ? <Notice tone="info">{error}</Notice> : null}
    </Card>
  );
}
