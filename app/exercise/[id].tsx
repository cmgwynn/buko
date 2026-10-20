import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { LineChart } from '../../src/components/Charts';
import { Card, Loading, Notice, Screen } from '../../src/components/ui';
import { estimateOneRepMax, personalRecords, type PersonalRecords } from '../../src/lib/fitness/calc';
import { exerciseHistory, loadExercises } from '../../src/lib/fitness/data';
import { distanceUnit, toDisplayDistance, toDisplayWeight, weightUnit } from '../../src/lib/fitness/format';
import { MUSCLE_LABEL, type Exercise } from '../../src/lib/fitness/types';
import { useProfile } from '../../src/providers/ProfileProvider';
import { spacing, typography } from '../../src/theme';

type Hist = Awaited<ReturnType<typeof exerciseHistory>>;

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const units = profile?.units ?? 'metric';
  const [ex, setEx] = useState<Exercise | null>(null);
  const [hist, setHist] = useState<Hist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadExercises(), exerciseHistory(id)])
      .then(([all, h]) => {
        setEx(all.find((e) => e.id === id) ?? null);
        setHist(h);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!ex || !hist) return <Loading />;

  const cardio = ex.category === 'cardio';
  const pr: PersonalRecords = personalRecords(hist.dated);
  const w = (kg: number) => `${toDisplayWeight(kg, units)} ${weightUnit(units)}`;

  // Best estimated 1RM per day, oldest first, for the progress line.
  const byDay = new Map<string, number>();
  for (const s of hist.dated) {
    if (s.is_warmup || !s.reps || !s.weight_kg) continue;
    byDay.set(s.date, Math.max(byDay.get(s.date) ?? 0, estimateOneRepMax(s.weight_kg, s.reps)));
  }
  const line = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, kg]) => ({ date, value: toDisplayWeight(kg, units) }));

  return (
    <Screen>
      <Text style={typography.heading}>{ex.name}</Text>
      <Text style={typography.small}>{ex.muscle_groups.map((m) => MUSCLE_LABEL[m] ?? m).join(', ')}{ex.equipment ? ` · ${ex.equipment}` : ''}</Text>
      <View style={{ height: spacing.md }} />

      {!cardio ? (
        <Card>
          <Text style={typography.label}>Personal records</Text>
          {pr.heaviest ? (
            <>
              <Text style={typography.body}>Heaviest: {w(pr.heaviest.weight_kg)} × {pr.heaviest.reps}</Text>
              <Text style={typography.body}>Best estimated 1RM: {w(pr.bestOneRepMax!.value)}</Text>
              <Text style={typography.body}>Best set volume: {w(pr.bestSetVolume!.value)}</Text>
              <Text style={[typography.small, { marginTop: spacing.xs }]}>
                Estimated 1RM uses the Epley formula (weight × (1 + reps ÷ 30)). Warm-up sets are ignored.
              </Text>
            </>
          ) : (
            <Text style={typography.small}>No sets logged yet. Your records will show here.</Text>
          )}
        </Card>
      ) : null}

      {line.length > 0 ? (
        <Card>
          <Text style={typography.label}>Estimated 1RM over time</Text>
          <LineChart line={line} dots={line} unit={weightUnit(units)} />
        </Card>
      ) : null}

      <Text style={[typography.heading, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>History</Text>
      {hist.sessions.length === 0 ? <Text style={typography.small}>Not logged yet.</Text> : null}
      {hist.sessions.slice(0, 20).map((s) => (
        <Card key={s.workoutId} style={{ padding: spacing.md }}>
          <Text style={typography.subheading}>{s.date}</Text>
          {s.sets.map((x, n) => (
            <Text key={n} style={typography.small}>
              {cardio
                ? `${x.duration_s ? `${Math.round(x.duration_s / 60)} min` : ''}${x.distance_m ? ` · ${toDisplayDistance(x.distance_m, units)} ${distanceUnit(units)}` : ''}`
                : `${x.is_warmup ? 'Warm-up ' : ''}${x.weight_kg != null ? w(x.weight_kg) : 'bodyweight'} × ${x.reps ?? 0}`}
            </Text>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
