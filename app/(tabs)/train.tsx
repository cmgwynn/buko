import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Empty, Notice, Screen } from '../../src/components/ui';
import { toDateString } from '../../src/lib/diary';
import { loadRecentWorkouts, loadRoutines, loadTraining, routineToItems, type RoutineRow, type WorkoutListRow } from '../../src/lib/fitness/data';
import { setVolume } from '../../src/lib/fitness/calc';
import { toDisplayWeight, weightUnit } from '../../src/lib/fitness/format';
import { startSession, useWorkoutSession } from '../../src/lib/fitness/session';
import { loadActivityForDay, syncIfDue } from '../../src/lib/health';
import { weekStart } from '../../src/lib/recipes/week';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSettings } from '../../src/providers/SettingsProvider';
import { colors, spacing, typography } from '../../src/theme';

export default function Train() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const active = useWorkoutSession();
  const units = profile?.units ?? 'metric';
  const [recent, setRecent] = useState<WorkoutListRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [week, setWeek] = useState({ workouts: 0, minutes: 0, volumeKg: 0 });
  const [steps, setSteps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const monday = weekStart(toDateString(new Date()));
      const since = new Date(`${monday}T00:00:00`).toISOString();
      const [r, ro, t] = await Promise.all([loadRecentWorkouts(15), loadRoutines(), loadTraining(since)]);
      setRecent(r);
      setRoutines(ro);
      const thisWeek = r.filter((w) => w.started_at >= since);
      setWeek({
        workouts: thisWeek.length,
        minutes: Math.round(thisWeek.reduce((s, w) => s + (w.duration_min ?? 0), 0)),
        volumeKg: t.reduce((s, row) => s + row.workout_sets.filter((x) => !x.is_warmup).reduce((a, x) => a + setVolume(x), 0), 0),
      });
      if (settings?.health_read_steps) setSteps((await loadActivityForDay(toDateString(new Date())))?.steps ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoaded(true);
  }, [settings?.health_read_steps]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (session && settings) {
        syncIfDue(session.user.id, settings).then((did) => {
          if (did) load();
        });
      }
    }, [load, session, settings]),
  );

  function start(routine?: RoutineRow) {
    if (!active.active) startSession(routine ? routine.name : 'Workout', routine?.id ?? null, routine ? routineToItems(routine) : []);
    router.push('/workout/active');
  }

  return (
    <Screen>
      <TabHeader
        title="Train"
        right={
          <Pressable onPress={() => router.push('/health')} hitSlop={10} accessibilityLabel="Health and activity settings">
            <Ionicons name="pulse-outline" size={26} color={colors.primary} />
          </Pressable>
        }
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card>
        <Text style={typography.label}>This week</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm }}>
          <Stat value={String(week.workouts)} label="workouts" />
          <Stat value={String(week.minutes)} label="minutes" />
          <Stat value={Math.round(toDisplayWeight(week.volumeKg, units)).toLocaleString()} label={`${weightUnit(units)} lifted`} />
          {steps != null ? <Stat value={steps.toLocaleString()} label="steps today" /> : null}
        </View>
      </Card>

      {active.active ? (
        <Button title="Resume workout" icon="play" onPress={() => start()} />
      ) : (
        <Button title="Start workout" icon="barbell-outline" onPress={() => start()} />
      )}
      <View style={{ height: spacing.sm }} />
      <Button title="Browse workout library" icon="library-outline" variant="secondary" onPress={() => router.push('/workout/library')} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Button title="Progress" icon="stats-chart-outline" variant="secondary" onPress={() => router.push('/progress')} /></View>
        <View style={{ flex: 1 }}><Button title="Exercises" icon="search-outline" variant="secondary" onPress={() => router.push('/workout/exercises')} /></View>
      </View>
      <View style={{ height: spacing.sm }} />
      <Button title="Log weight & measurements" icon="body-outline" variant="secondary" onPress={() => router.push('/body')} />

      <Text style={[typography.heading, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>Routines</Text>
      <Button title="Create routine" icon="add" variant="secondary" onPress={() => router.push('/routine/edit')} />
      {routines.length === 0 ? (
        <Text style={typography.small}>Create your own routine, customize an idea from the workout library, or save one when finishing a workout.</Text>
      ) : (
        routines.map((r) => (
            <Card key={r.id} style={{ padding: spacing.md }}>
              <View>
                <Text style={typography.subheading}>{r.name}</Text>
                <Text style={typography.small} numberOfLines={1}>{r.routine_exercises.map((x) => x.exercises.name).join(' · ')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><Button title="Start" icon="play-outline" disabled={active.active} onPress={() => start(r)} /></View>
                <View style={{ flex: 1 }}><Button title="Edit" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/routine/edit', params: { id: r.id } })} /></View>
              </View>
            </Card>
        ))
      )}

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
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>{value}</Text>
      <Text style={typography.small}>{label}</Text>
    </View>
  );
}
