import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card, Notice, Screen, TextField } from '../../src/components/ui';
import { estimateCalories, estimateStrengthMinutes, newRecordsFor, type DatedSet } from '../../src/lib/fitness/calc';
import { exerciseHistory, saveRoutine, saveWorkout } from '../../src/lib/fitness/data';
import {
  distanceUnit, formatDuration, fromDisplayDistance, fromDisplayWeight, parseNum, toDisplayDistance, toDisplayWeight, weightUnit,
} from '../../src/lib/fitness/format';
import { blankSet, endSession, updateSession, useWorkoutSession } from '../../src/lib/fitness/session';
import type { WorkoutSet } from '../../src/lib/fitness/types';
import { activityHintFor, syncWorkoutToHealth } from '../../src/lib/health';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSettings } from '../../src/providers/SettingsProvider';
import { colors, radius, spacing, typography } from '../../src/theme';

const RECORD_LABEL = { heaviest: 'Heaviest', oneRepMax: 'Est. 1RM', setVolume: 'Set volume' } as const;

function NumInput({ value, onChange, placeholder, width = 64 }: { value: number | null; onChange: (n: number | null) => void; placeholder?: string; width?: number }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  return (
    <TextInput
      value={text}
      onChangeText={(t) => {
        setText(t);
        onChange(t.trim() === '' ? null : parseNum(t));
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType="decimal-pad"
      style={{
        width, height: 40, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted, textAlign: 'center', fontSize: 16, color: colors.text,
      }}
    />
  );
}

export default function ActiveWorkout() {
  useKeepAwake();
  const router = useRouter();
  const { session: auth } = useAuth();
  const { profile } = useProfile();
  const { settings } = useSettings();
  const w = useWorkoutSession();
  const units = profile?.units ?? 'metric';
  const [now, setNow] = useState(Date.now());
  const [histories, setHistories] = useState<Record<string, { dated: DatedSet[]; last: WorkoutSet[] }>>({});
  const loading = useRef(new Set<string>());
  const [finishing, setFinishing] = useState(false);
  const [saveAs, setSaveAs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load each exercise's past sets once, for the placeholders and the new-record badges.
  useEffect(() => {
    for (const item of w.items) {
      const id = item.exercise.id;
      if (histories[id] || loading.current.has(id)) continue;
      loading.current.add(id);
      exerciseHistory(id)
        .then((h) => setHistories((cur) => ({ ...cur, [id]: { dated: h.dated, last: h.sessions[0]?.sets ?? [] } })))
        .catch(() => setHistories((cur) => ({ ...cur, [id]: { dated: [], last: [] } })));
    }
  }, [w.items, histories]);

  if (!w.active) {
    return (
      <Screen>
        <Text style={typography.body}>No workout in progress.</Text>
        <View style={{ height: spacing.md }} />
        <Button title="Back to Train" onPress={() => router.replace('/(tabs)/train')} />
      </Screen>
    );
  }

  const elapsedS = Math.max(0, Math.round((now - w.startedAt) / 1000));

  function patchSet(key: string, idx: number, patch: Partial<WorkoutSet>) {
    updateSession((s) => ({
      ...s,
      items: s.items.map((i) => (i.key === key ? { ...i, sets: i.sets.map((x, n) => (n === idx ? { ...x, ...patch } : x)) } : i)),
    }));
  }
  function addSet(key: string) {
    updateSession((s) => ({
      ...s,
      items: s.items.map((i) => {
        if (i.key !== key) return i;
        const prev = i.sets[i.sets.length - 1];
        return { ...i, sets: [...i.sets, blankSet(i.sets.length, prev ? { reps: prev.reps, weight_kg: prev.weight_kg, duration_s: prev.duration_s, distance_m: prev.distance_m } : undefined)] };
      }),
    }));
  }
  function removeSet(key: string, idx: number) {
    updateSession((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, sets: i.sets.filter((_, n) => n !== idx) } : i)) }));
  }
  function removeItem(key: string) {
    updateSession((s) => ({ ...s, items: s.items.filter((i) => i.key !== key) }));
  }

  function summary() {
    const bodyKg = profile?.weight_kg ?? 70;
    let cardioMin = 0;
    let cardioKcal = 0;
    let strengthSets = 0;
    let strengthMetSum = 0;
    let strengthN = 0;
    for (const i of w.items) {
      if (i.exercise.category === 'cardio') {
        const min = i.sets.reduce((s, x) => s + (x.duration_s ?? 0), 0) / 60;
        cardioMin += min;
        cardioKcal += estimateCalories(i.exercise.met, bodyKg, min);
      } else {
        const n = i.sets.filter((x) => !x.is_warmup && (x.reps ?? 0) > 0).length;
        if (n > 0) {
          strengthSets += n;
          strengthMetSum += i.exercise.met * n;
          strengthN += n;
        }
      }
    }
    // Time not spent on timed cardio is treated as strength time, but never less than the per-set estimate.
    const elapsedMin = elapsedS / 60;
    const strengthMin = strengthSets > 0 ? Math.max(elapsedMin - cardioMin, estimateStrengthMinutes(strengthSets)) : 0;
    const strengthKcal = strengthSets > 0 ? estimateCalories(strengthMetSum / strengthN, bodyKg, strengthMin) : 0;
    const duration = Math.max(1, Math.round(Math.max(elapsedMin, cardioMin + strengthMin)));
    return { duration, calories: cardioKcal + strengthKcal, strengthSets, cardioMin: Math.round(cardioMin) };
  }

  async function finish() {
    if (busy) return;
    if (!auth) return setError('Please log in again before saving your workout.');
    if (saveAs.trim().length > 100) return setError('Use a routine name of 100 characters or fewer.');
    const done = w.items.filter((i) => i.sets.length > 0);
    if (done.length === 0) return setError('Add at least one exercise with a set.');
    setBusy(true);
    setError(null);
    try {
      const sum = summary();
      const id = await saveWorkout(auth.user.id, w, { durationMin: sum.duration, calories: sum.calories || null, caloriesEstimated: true });
      let routineError: string | undefined;
      if (saveAs.trim()) {
        try {
          await saveRoutine(auth.user.id, saveAs, w);
        } catch (err) {
          routineError = err instanceof Error ? err.message : 'Please try creating the routine again.';
        }
      }
      const startedAt = new Date(w.startedAt);
      const name = w.name;
      const hint = activityHintFor(w.items.map((i) => ({ name: i.exercise.name, category: i.exercise.category })));
      const distanceM = w.items.reduce((s, i) => s + (i.exercise.category === 'cardio' ? i.sets.reduce((a, x) => a + (x.distance_m ?? 0), 0) : 0), 0);
      endSession();
      if (settings?.health_write_workouts) {
        // Best effort: a failure here never loses the saved workout.
        syncWorkoutToHealth({ id, name, startedAt, durationMin: sum.duration, calories: sum.calories || null, hint, distanceM: distanceM || null }).catch(() => {});
      }
      router.replace({ pathname: '/workout/[id]', params: { id, ...(routineError ? { routineError } : {}) } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function discard() {
    setConfirmingDiscard(true);
  }

  if (finishing) {
    const sum = summary();
    return (
      <Screen>
        <Text style={typography.heading}>Nice work</Text>
        <Card style={{ marginTop: spacing.md }}>
          <Text style={typography.body}>Time: {sum.duration} min</Text>
          <Text style={typography.body}>Estimated burn: {Math.round(sum.calories)} kcal</Text>
          <Text style={[typography.small, { marginTop: spacing.xs }]}>
            An estimate from the exercises’ MET values (a standard energy-cost rating), your weight and time. It can be off by a lot, so treat it as a rough guide.
          </Text>
        </Card>
        <TextField label="Save as a routine (optional)" placeholder="e.g. Push day" value={saveAs} onChangeText={setSaveAs} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button title="Save workout" onPress={finish} loading={busy} />
        <View style={{ height: spacing.sm }} />
        <Button title="Keep training" variant="ghost" onPress={() => setFinishing(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <TextInput
            value={w.name}
            onChangeText={(name) => updateSession((s) => ({ ...s, name }))}
            style={[typography.heading, { paddingVertical: spacing.xs }]}
            placeholder="Workout name"
          />
          <Text style={typography.small}>{formatDuration(elapsedS)} · screen stays awake</Text>
        </View>
        <Pressable onPress={discard} hitSlop={10} accessibilityLabel="Discard workout">
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </Pressable>
      </View>
      {confirmingDiscard ? (
        <Card>
          <Text style={typography.heading}>Discard workout?</Text>
          <Text style={typography.body}>Nothing from this workout will be saved. Your saved routine is kept.</Text>
          <Button title="Confirm discard workout" variant="danger" onPress={() => { endSession(); router.dismissTo('/(tabs)/train'); }} />
          <Button title="Keep going" variant="secondary" onPress={() => setConfirmingDiscard(false)} />
        </Card>
      ) : null}

      <View style={{ height: spacing.md }} />
      {w.items.map((item) => {
        const hist = histories[item.exercise.id];
        const cardio = item.exercise.category === 'cardio';
        return (
          <Card key={item.key}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[typography.subheading, { flex: 1 }]}>{item.exercise.name}</Text>
              <Pressable onPress={() => removeItem(item.key)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm }}>
              <Text style={[typography.label, { width: 22 }]}>#</Text>
              {cardio ? (
                <>
                  <Text style={[typography.label, { width: 64, textAlign: 'center' }]}>min</Text>
                  <Text style={[typography.label, { width: 64, textAlign: 'center' }]}>{distanceUnit(units)}</Text>
                </>
              ) : (
                <>
                  <Text style={[typography.label, { width: 64, textAlign: 'center' }]}>{weightUnit(units)}</Text>
                  <Text style={[typography.label, { width: 64, textAlign: 'center' }]}>reps</Text>
                  <Text style={[typography.label, { width: 40, textAlign: 'center' }]}>warm</Text>
                </>
              )}
            </View>
            {item.sets.map((set, idx) => {
              const prev = hist?.last[idx];
              const records = !cardio && hist ? newRecordsFor(hist.dated, set) : [];
              return (
                <View key={idx} style={{ marginTop: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={[typography.small, { width: 22 }]}>{idx + 1}</Text>
                    {cardio ? (
                      <>
                        <NumInput value={set.duration_s != null ? Math.round((set.duration_s / 60) * 10) / 10 : null} onChange={(n) => patchSet(item.key, idx, { duration_s: n == null ? null : Math.round(n * 60) })} placeholder={prev?.duration_s ? String(Math.round(prev.duration_s / 60)) : '—'} />
                        <NumInput value={set.distance_m != null ? toDisplayDistance(set.distance_m, units) : null} onChange={(n) => patchSet(item.key, idx, { distance_m: n == null ? null : fromDisplayDistance(n, units) })} placeholder={prev?.distance_m ? String(toDisplayDistance(prev.distance_m, units)) : '—'} />
                      </>
                    ) : (
                      <>
                        <NumInput value={set.weight_kg != null ? toDisplayWeight(set.weight_kg, units) : null} onChange={(n) => patchSet(item.key, idx, { weight_kg: n == null ? null : fromDisplayWeight(n, units) })} placeholder={prev?.weight_kg != null ? String(toDisplayWeight(prev.weight_kg, units)) : '—'} />
                        <NumInput value={set.reps} onChange={(n) => patchSet(item.key, idx, { reps: n == null ? null : Math.round(n) })} placeholder={prev?.reps != null ? String(prev.reps) : '—'} />
                        <Pressable onPress={() => patchSet(item.key, idx, { is_warmup: !set.is_warmup })} style={{ width: 40, alignItems: 'center' }} accessibilityLabel="Toggle warm-up set">
                          <Ionicons name={set.is_warmup ? 'checkbox' : 'square-outline'} size={24} color={set.is_warmup ? colors.primary : colors.textMuted} />
                        </Pressable>
                      </>
                    )}
                    <Pressable onPress={() => removeSet(item.key, idx)} hitSlop={8}>
                      <Ionicons name="remove-circle-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                  {!cardio ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, marginLeft: 30 }}>
                      <Text style={typography.small}>Minutes (optional)</Text>
                      <NumInput value={set.duration_s == null ? null : set.duration_s / 60} onChange={(n) => patchSet(item.key, idx, { duration_s: n == null ? null : Math.round(n * 60) })} placeholder="min" />
                    </View>
                  ) : null}
                  {records.length ? (
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginLeft: 30, marginTop: 2 }}>
                      🏆 New record: {records.map((r) => RECORD_LABEL[r]).join(', ')}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            <View style={{ marginTop: spacing.md }}>
              <Button title={cardio ? 'Add interval' : 'Add set'} icon="add" variant="secondary" onPress={() => addSet(item.key)} />
            </View>
          </Card>
        );
      })}

      <Button title="Add exercise" icon="barbell-outline" variant="secondary" onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'pick' } })} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ height: spacing.lg }} />
      <Button title="Finish workout" onPress={() => (w.items.some((i) => i.sets.length) ? setFinishing(true) : setError('Add at least one exercise with a set.'))} />
    </Screen>
  );
}
