import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BarChart, LineChart } from '../src/components/Charts';
import { Button, Card, Chip, ChipRow, Notice, Screen } from '../src/components/ui';
import { addDays, toDateString } from '../src/lib/diary';
import { movingAverage7, personalRecords, setsByMuscle, weeklyVolume, type DatedSet } from '../src/lib/fitness/calc';
import { loadAllTraining, loadMeasurements, localDate, type MeasurementRow } from '../src/lib/fitness/data';
import { toDisplayWeight, weightUnit } from '../src/lib/fitness/format';
import { MEASUREMENT_KINDS, MUSCLE_LABEL, type MeasurementKind } from '../src/lib/fitness/types';
import { useProfile } from '../src/providers/ProfileProvider';
import { colors, spacing, typography } from '../src/theme';

export default function Progress() {
  const router = useRouter();
  const { profile } = useProfile();
  const units = profile?.units ?? 'metric';
  const [volume, setVolume] = useState<{ label: string; value: number }[]>([]);
  const [muscles, setMuscles] = useState<[string, number][]>([]);
  const [records, setRecords] = useState<{ id: string; name: string; weightKg: number; reps: number }[]>([]);
  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [kind, setKind] = useState<MeasurementKind>('weight');
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const today = toDateString(new Date());
      Promise.all([loadAllTraining(), loadMeasurements()])
        .then(([training, meas]) => {
          const dated: DatedSet[] = training.flatMap((t) => t.workout_sets.map((s) => ({ date: localDate(t.workouts.started_at), reps: s.reps, weight_kg: s.weight_kg, is_warmup: s.is_warmup })));
          setVolume(weeklyVolume(dated, 8, today).map((w) => ({ label: `${Number(w.weekStart.slice(5, 7))}/${Number(w.weekStart.slice(8, 10))}`, value: Math.round(toDisplayWeight(w.volumeKg, units)) })));

          const cutoff = addDays(today, -27);
          const recent = training.filter((t) => localDate(t.workouts.started_at) >= cutoff);
          setMuscles(Object.entries(setsByMuscle(recent.map((t) => ({ exercise: t.exercises, sets: t.workout_sets })))).sort((a, b) => b[1] - a[1]));

          const byEx = new Map<string, { name: string; sets: DatedSet[] }>();
          for (const t of training) {
            if (t.exercises.category === 'cardio') continue;
            const e = byEx.get(t.exercise_id) ?? { name: t.exercises.name, sets: [] };
            e.sets.push(...t.workout_sets.map((s) => ({ date: localDate(t.workouts.started_at), reps: s.reps, weight_kg: s.weight_kg, is_warmup: s.is_warmup })));
            byEx.set(t.exercise_id, e);
          }
          const recs = [...byEx.entries()]
            .map(([id, e]) => ({ id, name: e.name, pr: personalRecords(e.sets).heaviest }))
            .filter((r): r is { id: string; name: string; pr: NonNullable<typeof r.pr> } => !!r.pr)
            .sort((a, b) => b.pr.weight_kg - a.pr.weight_kg)
            .slice(0, 10)
            .map((r) => ({ id: r.id, name: r.name, weightKg: r.pr.weight_kg, reps: r.pr.reps }));
          setRecords(recs);
          setRows(meas);
          setError(null);
        })
        .catch((e) => setError(e.message));
    }, [units]),
  );

  const meta = MEASUREMENT_KINDS.find((k) => k.key === kind)!;
  const isWeight = kind === 'weight';
  const conv = (kg: number) => (isWeight ? toDisplayWeight(kg, units) : kind === 'body_fat' ? kg : units === 'metric' ? kg : Math.round((kg / 2.54) * 10) / 10);
  const unit = isWeight ? weightUnit(units) : kind === 'body_fat' ? '%' : units === 'metric' ? 'cm' : 'in';
  const points = rows.filter((r) => r.kind === kind).map((r) => ({ date: r.measured_on, value: conv(r.value) }));
  // Smoothing is done on the metric values, then converted, so unit rounding does not leak into the average.
  const avg = isWeight ? movingAverage7(rows.filter((r) => r.kind === 'weight').map((r) => ({ date: r.measured_on, value: r.value }))).map((p) => ({ date: p.date, value: conv(p.value) })) : points;
  const latest = avg[avg.length - 1];
  const first = avg[0];

  return (
    <Screen>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Text style={typography.heading}>Body</Text>
      <ChipRow>
        {MEASUREMENT_KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
        ))}
      </ChipRow>
      <Card>
        {points.length === 0 ? (
          <Text style={typography.small}>No {meta.label.toLowerCase()} logged yet.</Text>
        ) : (
          <>
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>
              {Math.round(latest.value * 10) / 10} {unit}
            </Text>
            <Text style={typography.small}>
              {isWeight ? '7-day average' : 'Latest'}
              {avg.length > 1 ? ` · ${latest.value - first.value >= 0 ? '+' : ''}${Math.round((latest.value - first.value) * 10) / 10} ${unit} since ${first.date}` : ''}
            </Text>
            <View style={{ height: spacing.md }} />
            <LineChart dots={points} line={isWeight ? avg : undefined} unit={unit} />
            {isWeight ? <Text style={[typography.small, { marginTop: spacing.xs }]}>Faint dots are daily readings; the line is the trailing 7-day average, so daily water swings don’t distract from the trend.</Text> : null}
          </>
        )}
        <View style={{ height: spacing.md }} />
        <Button title="Log weight or measurement" icon="add" variant="secondary" onPress={() => router.push('/body')} />
      </Card>

      <Text style={[typography.heading, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Weekly training volume</Text>
      <Card>
        <BarChart bars={volume} unit={`${weightUnit(units)} lifted per week (reps × weight, warm-ups excluded)`} />
      </Card>

      <Text style={[typography.heading, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Sets by muscle, last 4 weeks</Text>
      <Card>
        {muscles.length === 0 ? <Text style={typography.small}>Log strength workouts to see your balance.</Text> : null}
        {muscles.map(([m, n]) => (
          <View key={m} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={typography.body}>{MUSCLE_LABEL[m as keyof typeof MUSCLE_LABEL] ?? m}</Text>
              <Text style={typography.small}>{n} sets</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, marginTop: 4 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: `${Math.min(100, (n / muscles[0][1]) * 100)}%` }} />
            </View>
          </View>
        ))}
      </Card>

      <Text style={[typography.heading, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Personal records</Text>
      {records.length === 0 ? <Text style={typography.small}>Your heaviest lifts will appear here.</Text> : null}
      {records.map((r) => (
        <Pressable key={r.id} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: r.id } })}>
          <Card style={{ padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={typography.subheading}>{r.name}</Text>
            <Text style={typography.body}>{toDisplayWeight(r.weightKg, units)} {weightUnit(units)} × {r.reps}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
