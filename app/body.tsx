import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, ChipRow, Notice, Screen, TextField } from '../src/components/ui';
import { addDays, formatDay, toDateString } from '../src/lib/diary';
import { loadMeasurements, upsertMeasurement } from '../src/lib/fitness/data';
import { fromDisplayWeight, parseNum, toDisplayWeight, weightUnit } from '../src/lib/fitness/format';
import { MEASUREMENT_KINDS, type MeasurementKind } from '../src/lib/fitness/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useProfile } from '../src/providers/ProfileProvider';
import { colors, spacing, typography } from '../src/theme';

export default function Body() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const units = profile?.units ?? 'metric';
  const [kind, setKind] = useState<MeasurementKind>('weight');
  const [date, setDate] = useState(toDateString(new Date()));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const unit = kind === 'weight' ? weightUnit(units) : kind === 'body_fat' ? '%' : units === 'metric' ? 'cm' : 'in';

  // Show the previous reading of this kind as a hint.
  useEffect(() => {
    loadMeasurements(kind)
      .then((rows) => {
        const r = rows[rows.length - 1];
        if (!r) return setLast(null);
        const v = kind === 'weight' ? toDisplayWeight(r.value, units) : kind === 'body_fat' || units === 'metric' ? r.value : Math.round((r.value / 2.54) * 10) / 10;
        setLast(`Last: ${v} ${unit} on ${r.measured_on}`);
      })
      .catch(() => setLast(null));
  }, [kind, units, unit]);

  async function save() {
    const n = parseNum(text);
    if (!session || n == null || n <= 0) return setError('Enter a number greater than zero.');
    const metric = kind === 'weight' ? fromDisplayWeight(n, units) : kind === 'body_fat' ? n : units === 'metric' ? n : n * 2.54;
    if (kind === 'body_fat' && n >= 100) return setError('Body fat must be below 100%.');
    setBusy(true);
    setError(null);
    try {
      await upsertMeasurement(session.user.id, date, kind, Math.round(metric * 100) / 100);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ChipRow>
        {MEASUREMENT_KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => setKind(k.key)} />
        ))}
      </ChipRow>
      <View style={{ height: spacing.md }} />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button title="‹" variant="ghost" onPress={() => setDate(addDays(date, -1))} />
          <Text style={typography.subheading}>{formatDay(date)}</Text>
          <Button title="›" variant="ghost" onPress={() => setDate(addDays(date, 1))} disabled={date >= toDateString(new Date())} />
        </View>
        <TextField label={`Value (${unit})`} value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="0" />
        {last ? <Text style={typography.small}>{last}</Text> : null}
        {kind === 'weight' ? (
          <Text style={[typography.small, { marginTop: spacing.sm, color: colors.textMuted }]}>
            Logging weight doesn’t change your calorie target. Weigh in whenever you like; charts show a 7-day average.
          </Text>
        ) : null}
      </Card>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button title="Save" onPress={save} loading={busy} />
    </Screen>
  );
}
