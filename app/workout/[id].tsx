import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Loading, Notice, Screen } from '../../src/components/ui';
import { distanceUnit, toDisplayDistance, toDisplayWeight, weightUnit } from '../../src/lib/fitness/format';
import { startSession, useWorkoutSession } from '../../src/lib/fitness/session';
import type { Exercise, WorkoutSet } from '../../src/lib/fitness/types';
import { removeWorkoutFromHealth } from '../../src/lib/health';
import { supabase } from '../../src/lib/supabase';
import { useProfile } from '../../src/providers/ProfileProvider';
import { spacing, typography } from '../../src/theme';

interface Detail {
  id: string;
  name: string;
  started_at: string;
  duration_min: number | null;
  calories_burned: number | null;
  calories_estimated: boolean;
  source: string;
  exported_external_id: string | null;
  workout_exercises: { position: number; exercises: Exercise; workout_sets: WorkoutSet[] }[];
}

export default function WorkoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useProfile();
  const units = profile?.units ?? 'metric';
  const active = useWorkoutSession();
  const [w, setW] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('workouts')
      .select('id, name, started_at, duration_min, calories_burned, calories_estimated, source, exported_external_id, workout_exercises(position, exercises(*), workout_sets(position, reps, weight_kg, is_warmup, duration_s, distance_m))')
      .eq('id', id)
      .single()
      .then(({ data, error: e }) => (e ? setError(e.message) : setW(data as unknown as Detail)));
  }, [id]);

  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!w) return <Loading />;

  const items = [...w.workout_exercises].sort((a, b) => a.position - b.position).map((i) => ({ ...i, workout_sets: [...i.workout_sets].sort((a, b) => a.position - b.position) }));

  function repeat() {
    if (active.active) return Alert.alert('Workout in progress', 'Finish or discard your current workout first.');
    startSession(
      w!.name,
      null,
      items.map((i) => ({
        exercise: i.exercises,
        // Same sets as last time, ready to adjust.
        sets: i.workout_sets.map((s, n) => ({ ...s, position: n })),
      })),
    );
    router.replace('/workout/active');
  }

  function remove() {
    Alert.alert('Delete workout?', 'This also removes it from your records and progress.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.from('workouts').delete().eq('id', w!.id);
          if (e) return setError(e.message);
          removeWorkoutFromHealth(w!.exported_external_id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text style={typography.heading}>{w.name}</Text>
      <Text style={typography.small}>
        {new Date(w.started_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        {w.duration_min ? ` · ${Math.round(w.duration_min)} min` : ''}
        {w.calories_burned ? ` · ${Math.round(w.calories_burned)} kcal${w.calories_estimated ? ' (estimate)' : ''}` : ''}
      </Text>
      {w.source !== 'buko' ? <Text style={[typography.small, { marginTop: spacing.xs }]}>Imported from {w.source === 'healthkit' ? 'Apple Health' : 'Health Connect'}.</Text> : null}
      <View style={{ height: spacing.md }} />

      {items.map((i, idx) => (
        <Card key={idx}>
          <Text style={typography.subheading}>{i.exercises.name}</Text>
          {i.workout_sets.map((s, n) => (
            <Text key={n} style={typography.body}>
              {i.exercises.category === 'cardio'
                ? `${s.duration_s ? `${Math.round(s.duration_s / 60)} min` : ''}${s.distance_m ? ` · ${toDisplayDistance(s.distance_m, units)} ${distanceUnit(units)}` : ''}`
                : `${s.is_warmup ? 'Warm-up: ' : `Set ${n + 1}: `}${s.weight_kg != null ? `${toDisplayWeight(s.weight_kg, units)} ${weightUnit(units)}` : 'bodyweight'} × ${s.reps ?? 0}`}
            </Text>
          ))}
        </Card>
      ))}
      {items.length === 0 ? <Text style={typography.small}>No exercise details were recorded for this workout.</Text> : null}

      <View style={{ height: spacing.md }} />
      {items.length ? <Button title="Repeat this workout" icon="repeat" onPress={repeat} /> : null}
      <View style={{ height: spacing.sm }} />
      <Button title="Delete workout" variant="danger" onPress={remove} />
    </Screen>
  );
}
