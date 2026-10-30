import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TabHeader } from '../../src/components/TabHeader';
import { DateNavigator } from '../../src/components/date/DateNavigator';
import { DaySwipe } from '../../src/components/date/DaySwipe';
import { Button, Card, Empty, Eyebrow, HeroCard, Loading, NavigationRow, Notice, Screen } from '../../src/components/ui';
import { addLocalDays, localDateStartIso, mondayOfWeek, parseLocalDate } from '../../src/lib/dates';
import { loadRoutines, type RoutineRow, type TrainingRow, type WorkoutListRow } from '../../src/lib/fitness/data';
import { setVolume } from '../../src/lib/fitness/calc';
import { toDisplayWeight, weightUnit } from '../../src/lib/fitness/format';
import { useWorkoutRecovery, useWorkoutSession } from '../../src/lib/fitness/session';
import { loadActivityForDay, syncIfDue } from '../../src/lib/health';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSelectedDate } from '../../src/providers/SelectedDateProvider';
import { useSettings } from '../../src/providers/SettingsProvider';
import { colors, spacing, typography } from '../../src/theme';
import { PlannedWorkouts } from '../../src/components/workout/PlannedWorkouts';
import { useWorkoutMode } from '../../src/providers/WorkoutModeProvider';

export default function Train() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const workoutMode = useWorkoutMode();
  const { selectedDate, today } = useSelectedDate();
  const active = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  const units = profile?.units ?? 'metric';
  const [recent, setRecent] = useState<WorkoutListRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [week, setWeek] = useState({ workouts: 0, minutes: 0, volumeKg: 0 });
  const [steps, setSteps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!session) {
      setRecent([]);
      setRoutines([]);
      setWeek({ workouts: 0, minutes: 0, volumeKg: 0 });
      setSteps(null);
      setLoaded(true);
      return;
    }
    setRecent([]);
    setWeek({ workouts: 0, minutes: 0, volumeKg: 0 });
    setSteps(null);
    setLoaded(false);
    try {
      const monday = mondayOfWeek(selectedDate);
      const weekStartIso = localDateStartIso(monday);
      const weekEndIso = localDateStartIso(addLocalDays(monday, 7));
      const dayStartIso = localDateStartIso(selectedDate);
      const dayEndIso = localDateStartIso(addLocalDays(selectedDate, 1));
      const [recentResult, weekResult, routinesResult, trainingResult] = await Promise.all([
        supabase.from('workouts').select('id, name, started_at, duration_min, calories_burned, calories_estimated, source, workout_exercises(exercises(name))')
          .eq('user_id', session.user.id).gte('started_at', dayStartIso).lt('started_at', dayEndIso).order('started_at', { ascending: false }).limit(100),
        supabase.from('workouts').select('id, duration_min')
          .eq('user_id', session.user.id).gte('started_at', weekStartIso).lt('started_at', weekEndIso).limit(1000),
        loadRoutines(),
        supabase.from('workout_exercises').select('exercise_id, exercises(name, muscle_groups, category), workouts!inner(started_at), workout_sets(reps, weight_kg, is_warmup)')
          .eq('user_id', session.user.id).gte('workouts.started_at', weekStartIso).lt('workouts.started_at', weekEndIso).limit(1000),
      ]);
      if (request !== requestVersion.current) return;
      setRoutines(routinesResult);
      if (recentResult.error || weekResult.error || trainingResult.error) {
        throw new Error(recentResult.error?.message ?? weekResult.error?.message ?? trainingResult.error?.message);
      }
      const r = recentResult.data as unknown as WorkoutListRow[];
      const weekWorkouts = weekResult.data as { id: string; duration_min: number | null }[];
      const t = trainingResult.data as unknown as TrainingRow[];
      setRecent(r);
      setWeek({
        workouts: weekWorkouts.length,
        minutes: Math.round(weekWorkouts.reduce((s, w) => s + (w.duration_min ?? 0), 0)),
        volumeKg: t.reduce((s, row) => s + row.workout_sets.filter((x) => !x.is_warmup).reduce((a, x) => a + setVolume(x), 0), 0),
      });
      if (settings?.health_read_steps) {
        const activity = await loadActivityForDay(selectedDate);
        if (request === requestVersion.current) setSteps(activity?.steps ?? null);
      } else setSteps(null);
      if (request === requestVersion.current) setError(null);
    } catch (e) {
      if (request === requestVersion.current) setError((e as Error).message);
    }
    if (request === requestVersion.current) setLoaded(true);
  }, [selectedDate, session, settings?.health_read_steps]);

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      void load();
      if (session && settings) {
        syncIfDue(session.user.id, settings).then((did) => {
          if (did && focused) void load();
        }).catch((err) => { if (focused) setError((err as Error).message); });
      }
      return () => { focused = false; requestVersion.current += 1; };
    }, [load, session, settings]),
  );

  function start(routine?: RoutineRow) {
    if (!recovery.ready) { setError('Wait for your saved workout to finish loading.'); return; }
    if (active.active) router.push('/workout/active');
    else router.push({ pathname: '/workout/start', params: routine ? { routine: routine.id } : {} });
  }

  return (
    <DaySwipe>
    <Screen>
      <TabHeader
        title="Train"
        right={
          <Pressable onPress={() => router.push('/health')} hitSlop={10} accessibilityLabel="Health and activity settings">
            <Ionicons name="pulse-outline" size={26} color={colors.primary} />
          </Pressable>
        }
      />
      <DateNavigator />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {workoutMode.online === false ? <Notice tone="info">Offline: cached routines and workouts are available. Completed sessions sync when you reconnect.</Notice> : null}
      {workoutMode.error ? <Notice tone="danger">{workoutMode.error}</Notice> : null}
      {workoutMode.error && !workoutMode.pending ? <Button title="Retry fitness sync" variant="secondary" loading={workoutMode.syncing} disabled={workoutMode.online === false} onPress={() => { void workoutMode.retry(); }} /> : null}
      {workoutMode.pending ? <Card>
        <Text style={typography.subheading}>{workoutMode.pending} fitness change{workoutMode.pending === 1 ? '' : 's'} waiting to sync</Text>
        <Button title="Sync saved workouts" loading={workoutMode.syncing} disabled={workoutMode.online === false} onPress={() => { void workoutMode.retry(); }} />
      </Card> : null}
      {recovery.error ? <Notice tone="danger">{recovery.error} Open your workout to retry the device save.</Notice> : null}
      {selectedDate !== today ? (
        <Notice tone="info">Browsing {new Date(`${selectedDate}T00:00:00`).toLocaleDateString()}. Starting a workout always records the actual current time, not the selected date.</Notice>
      ) : null}

      <HeroCard>
        <Eyebrow onHero>
          {active.active ? 'Workout in progress' : `Week of ${parseLocalDate(mondayOfWeek(selectedDate)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${parseLocalDate(addLocalDays(mondayOfWeek(selectedDate), 6)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
        </Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'space-between', marginVertical: spacing.lg }}>
          <Stat value={String(week.workouts)} label="workouts" />
          <Stat value={String(week.minutes)} label="minutes" />
          <Stat value={Math.round(toDisplayWeight(week.volumeKg, units)).toLocaleString()} label={`${weightUnit(units)} lifted`} />
          {steps != null ? <Stat value={steps.toLocaleString()} label={`steps ${selectedDate === today ? 'today' : `on ${parseLocalDate(selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}`} /> : null}
        </View>
        {active.active ? (
          <Button title="Resume workout" icon="play" variant="accent" disabled={!recovery.ready} onPress={() => start()} />
        ) : (
          <Button title={selectedDate === today ? 'Start workout' : 'Start workout now'} icon="barbell-outline" variant="accent" disabled={!recovery.ready} onPress={() => start()} />
        )}
      </HeroCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}>
        <Text style={typography.heading}>Your routines</Text>
        <Button title="Create" icon="add" variant="ghost" onPress={() => router.push('/routine/edit')} />
      </View>
      {!loaded ? <Loading /> : null}
      {loaded && routines.length === 0 ? (
        <Card>
          <Text style={typography.body}>Start with a workout idea or create your own routine.</Text>
          <NavigationRow title="Browse workout library" icon="library-outline" onPress={() => router.push('/workout/library')} />
        </Card>
      ) : (
        routines.map((r) => (
            <Card key={r.id} accent={colors.primary} style={{ padding: spacing.md }}>
              <View>
                <Text style={typography.subheading}>{r.name}</Text>
                <Text style={typography.small} numberOfLines={1}>{r.routine_exercises.map((x) => x.exercises.name).join(' · ')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Button title="Start" icon="play-outline" disabled={active.active || !recovery.ready} onPress={() => start(r)} /></View>
                <View style={{ flex: 1 }}><Button title="Edit" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/routine/edit', params: { id: r.id } })} /></View>
              </View>
            </Card>
        ))
      )}

      <PlannedWorkouts routines={routines} />
      <Card>
        <NavigationRow title="Workout library" icon="library-outline" onPress={() => router.push('/workout/library')} />
        <NavigationRow title="Exercises" icon="search-outline" onPress={() => router.push('/workout/exercises')} />
        <NavigationRow title="Progress" icon="stats-chart-outline" onPress={() => router.push('/progress')} />
        <NavigationRow title="Weight & measurements" icon="body-outline" onPress={() => router.push('/body')} />
      </Card>
      <Text style={[typography.heading, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>Recent</Text>
      {loaded && recent.length === 0 ? <Empty icon="barbell-outline" text="No workouts yet. Start one above." /> : null}
      {recent.map((w) => (
        <Pressable key={w.id} onPress={() => router.push({ pathname: '/workout/[id]', params: { id: w.id } })}>
          <Card style={{ padding: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={typography.subheading}>{w.name}</Text>
              <Text style={typography.small}>{new Date(w.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
            </View>
            <Text style={typography.small}>
              {w.duration_min ? `${Math.round(w.duration_min)} min · ` : ''}
              {w.calories_burned ? `${Math.round(w.calories_burned)} kcal${w.calories_estimated ? ' (est.)' : ''} · ` : ''}
              {w.source === 'buko' ? `${w.workout_exercises.length} exercises` : `from ${w.source === 'healthkit' ? 'Apple Health' : 'Health Connect'}`}
            </Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
    </DaySwipe>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'], color: colors.onHero }}>{value}</Text>
      <Text style={[typography.eyebrow, { color: colors.onHeroMuted }]}>{label}</Text>
    </View>
  );
}
