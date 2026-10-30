import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, ChipRow, Disclosure, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { WorkoutFinishSummary, type WorkoutRecordCard } from '../../src/components/workout/WorkoutFinishSummary';
import { finishWorkoutOffline, summarizeActiveWorkout } from '../../src/lib/fitness/data';
import { getFinishedWorkout, type WorkoutSummary } from '../../src/lib/fitness/offline';
import { toDisplayWeight, weightUnit } from '../../src/lib/fitness/format';
import { pauseSession, resumeSession, updateSession, useWorkoutRecovery, useWorkoutSession } from '../../src/lib/fitness/session';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSettings } from '../../src/providers/SettingsProvider';
import { useWorkoutMode } from '../../src/providers/WorkoutModeProvider';
import { colors, spacing, typography } from '../../src/theme';

function recordCards(records: WorkoutSummary['records'], units: 'metric' | 'imperial'): WorkoutRecordCard[] {
  const labels = { heaviest: 'Heaviest working set', oneRepMax: 'Estimated 1-rep max', setVolume: 'Single-set volume' };
  return records.map((record) => {
    const unit = `${weightUnit(units)}${record.kind === 'setVolume' ? ' × reps' : ''}`;
    return {
      exerciseName: record.exerciseName, label: labels[record.kind],
      detail: `${toDisplayWeight(record.value, units)} ${unit} · previous ${toDisplayWeight(record.previousValue, units)} ${unit}`,
    };
  });
}

export default function FinishWorkout() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const mode = useWorkoutMode();
  const confirm = useConfirm();
  const w = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  const [notes, setNotes] = useState(w.notes ?? '');
  const [rating, setRating] = useState<'easy' | 'right' | 'hard' | null>(w.finishRating ?? null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [savedId, setSavedId] = useState<string | null>(id ?? null);
  const [syncStatus, setSyncStatus] = useState<'pending' | 'synced'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthRequested, setHealthRequested] = useState(false);
  const lock = useRef(false);
  const pausedForReview = useRef(false);
  useEffect(() => {
    let live = true;
    if (id && session) {
      getFinishedWorkout(session.user.id, id).then((finished) => {
        if (!live) return;
        if (!finished?.summary) { setError('This saved summary is unavailable on this device. Check Train for your synced workout.'); return; }
        setSummary(finished.summary);
        setSyncStatus(finished.syncStatus === 'synced' ? 'synced' : 'pending');
      }).catch((e: Error) => { if (live) setError(e.message); });
    } else if (w.active) {
      if (!w.pausedAt) { pauseSession(); pausedForReview.current = true; }
      summarizeActiveWorkout().then((value) => { if (live) setSummary(value); }).catch((e: Error) => { if (live) setError(e.message); });
    }
    return () => { live = false; };
  }, [id, session?.user.id]);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lock.current) return true;
      if (savedId) router.replace('/(tabs)/train');
      else back();
      return true;
    });
    return () => handler.remove();
  }, [savedId, router]);
  useEffect(() => {
    let live = true;
    if (savedId && session) {
      getFinishedWorkout(session.user.id, savedId).then((finished) => {
        if (!live || !finished) return;
        setSyncStatus(finished.syncStatus === 'synced' ? 'synced' : 'pending');
        setError(finished.syncError ?? null);
      }).catch((e: Error) => { if (live) setError(e.message); });
    }
    return () => { live = false; };
  }, [savedId, session?.user.id, mode.syncing, mode.pending]);
  async function save() {
    if (!session || !w.active || lock.current || savedId) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const uncompleted = w.items.reduce((sum, item) => sum + item.sets.filter((set) => !set.completed_at).length, 0);
      if (uncompleted && !await confirm({ title: 'Finish with incomplete sets?', message: `${uncompleted} unfinished set${uncompleted === 1 ? '' : 's'} will not be logged. Completed sets are kept.`, confirmLabel: 'Finish completed sets' })) return;
      const finished = await finishWorkoutOffline({ notes, rating, healthExport: settings?.health_write_workouts ?? false });
      setSummary(finished.summary); setSavedId(finished.id); setSyncStatus(finished.syncStatus);
      setHealthRequested(finished.healthExportRequested);
      setError(finished.syncError);
      router.setParams({ id: finished.id });
      await mode.refresh();
      void mode.retry();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the workout. Your active session is kept.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function back() {
    if (pausedForReview.current) resumeSession();
    router.replace('/workout/active');
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <Screen edges={[]} variant="form">
      <Heading>{savedId ? 'Workout complete' : 'Finish your workout'}</Heading>
      <Text style={[typography.body, { marginVertical: spacing.lg }]}>{savedId ? 'Your completed sets are saved on this device.' : 'Review your completed sets. The clock is paused while you review.'}</Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {mode.error && mode.error !== error ? <Notice tone="danger">{mode.error}</Notice> : null}
      {mode.native.liveActivity.status === 'error' ? <Notice tone="danger">{mode.native.liveActivity.reason ?? 'The lock-screen workout activity could not update.'}</Notice> : null}
      {!savedId && recovery.error ? <Notice tone="danger">{recovery.error} Your changes need a successful device save before you leave.</Notice> : null}
      {summary ? <WorkoutFinishSummary durationSec={summary.durationSec} volumeKg={summary.volumeKg} completedSets={summary.completedSets}
        records={recordCards(summary.records, profile?.units ?? 'metric')} cachedHistory units={profile?.units ?? 'metric'} /> : null}
      {!savedId && w.active ? <>
        <Text style={typography.label}>How did it feel? (optional)</Text>
        <ChipRow>{([{ value: 'easy', label: 'Easy' }, { value: 'right', label: 'About right' }, { value: 'hard', label: 'Hard' }] as const).map((choice) =>
          <Chip key={choice.value} label={choice.label} selected={rating === choice.value} disabled={busy} onPress={() => {
            const value = rating === choice.value ? null : choice.value;
            setRating(value); updateSession((session) => ({ ...session, finishRating: value }));
          }} />)}</ChipRow>
        <TextField label="Workout notes (optional)" multiline maxLength={4000} value={notes} editable={!busy} onChangeText={(value) => {
          setNotes(value); updateSession((session) => ({ ...session, notes: value }));
        }} />
        <Button title="Save finished workout" loading={busy} disabled={!summary?.completedSets} onPress={() => { void save(); }} />
        <Button title="Back to workout" variant="ghost" disabled={busy} onPress={back} />
      </> : savedId ? <>
        <Card>
          <Text accessibilityLiveRegion="polite" style={typography.subheading}>{syncStatus === 'synced' ? 'Synced to your account' : 'Saved on device · sync pending'}</Text>
          {healthRequested ? <><Text style={typography.small}>Health export syncs separately; a failure won't delete your workout.</Text><Disclosure title="About health export"><Text style={typography.small}>Export happens after syncing and requires your health permissions. A failed export never removes your Buko workout.</Text></Disclosure></> : null}
          <Button title="Retry workout and health sync" variant="secondary" loading={mode.syncing} disabled={mode.online === false} onPress={() => {
            void mode.retry().then(async () => {
              const finished = session ? await getFinishedWorkout(session.user.id, savedId) : null;
              if (finished) setSyncStatus(finished.syncStatus === 'synced' ? 'synced' : 'pending');
            }).catch((e: Error) => setError(e.message));
          }} />
        </Card>
        <Button title="Back to Train" onPress={() => router.replace('/(tabs)/train')} />
      </> : <Button title="Back to Train" onPress={() => router.replace('/(tabs)/train')} />}
    </Screen>
  </SafeAreaView>;
}
