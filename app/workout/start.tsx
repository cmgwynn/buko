import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Heading, Loading, Notice, Screen } from '../../src/components/ui';
import { WeeklyTrainingPlan } from '../../src/components/workout/WeeklyTrainingPlan';
import { loadRoutines, routineToItems, type RoutineRow } from '../../src/lib/fitness/data';
import { getSession, startSession, useWorkoutRecovery, useWorkoutSession, workoutSessionStore } from '../../src/lib/fitness/session';
import { spacing, typography } from '../../src/theme';

export default function StartWorkout() {
  const router = useRouter();
  const { routine: routineId } = useLocalSearchParams<{ routine?: string }>();
  const active = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let live = true;
    setLoading(true);
    loadRoutines().then((rows) => { if (live) setRoutines(rows); })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []));
  const routine = routines.find((row) => row.id === routineId);
  async function begin(chosen?: RoutineRow) {
    if (lock.current || !recovery.ready) return;
    if (active.active) { router.replace('/workout/active'); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      startSession(chosen?.name ?? 'Workout', chosen?.id ?? null, chosen ? routineToItems(chosen) : []);
      await workoutSessionStore.retry();
      const saved = workoutSessionStore.getRecovery();
      if (saved.error) throw new Error(saved.error);
      if (!getSession().active) throw new Error('The workout could not be started.');
      router.replace('/workout/active');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your workout on this device.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen variant="form">
    <Heading>{active.active ? 'A workout is already in progress' : 'Ready to train?'}</Heading>
    <Text style={[typography.body, { marginVertical: spacing.lg }]}>Use comfortable loads, warm up, and stop if you feel pain or unwell. Starting records the actual time, not the date you were browsing.</Text>
    {error || recovery.error ? <Notice tone="danger">{error ?? recovery.error}</Notice> : null}
    {active.active ? <>
      <Card><Text style={typography.subheading}>{active.name}</Text><Text style={typography.small}>{active.items.length} exercises · saved on this device</Text></Card>
      <Button title="Resume workout" disabled={!recovery.ready} onPress={() => router.replace('/workout/active')} />
    </> : <>
      {routineId && loading ? <Loading /> : null}
      {routineId && !loading && !routine ? <Notice tone="danger">This routine is unavailable. Reconnect to cache it, or start an empty session.</Notice> : null}
      {routine ? <Card>
        <Text style={typography.heading}>{routine.name}</Text>
        {routine.routine_exercises.map((item, index) => <Text key={`${item.exercise_id}:${index}`} style={[typography.body, { marginVertical: spacing.xs }]}>{item.exercises.name} · {item.target_sets ?? 1} sets</Text>)}
        <Button title={`Start ${routine.name}`} loading={busy} disabled={!recovery.ready} onPress={() => { void begin(routine); }} />
      </Card> : null}
      <Button title="Start empty workout" variant={routine ? 'secondary' : 'primary'} loading={busy} disabled={!recovery.ready} onPress={() => { void begin(); }} />
      {!routineId ? <>
        <View style={{ height: spacing.lg }} /><Heading>Or choose a saved routine</Heading>
        {loading ? <Loading /> : routines.map((row) => <Card key={row.id}><Text style={typography.subheading}>{row.name}</Text>
          <Button title={`Use ${row.name}`} variant="secondary" disabled={busy} onPress={() => router.setParams({ routine: row.id })} /></Card>)}
      </> : null}
      <WeeklyTrainingPlan disabled={busy || !recovery.ready} />
    </>}
  </Screen>;
}
