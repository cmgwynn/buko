import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, Loading, Notice } from '../../src/components/ui';
import { cancelNotification, configureNotifications, scheduleTimerNotification } from '../../src/lib/notifications';
import { loadRecipe, type RecipeFull } from '../../src/lib/recipes/db';
import { formatClock } from '../../src/lib/recipes/timers';
import { formatQuantity, scaleQuantity } from '../../src/lib/recipes/units';
import { colors, radius, spacing, typography } from '../../src/theme';

interface CookTimer {
  id: number;
  label: string;
  endsAt: number;
  notificationId: string | null;
  done: boolean;
}

export default function Cook() {
  useKeepAwake();
  const router = useRouter();
  const { id, servings, entry } = useLocalSearchParams<{ id: string; servings?: string; entry?: string }>();
  const [full, setFull] = useState<RecipeFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [timers, setTimers] = useState<CookTimer[]>([]);
  // Per-step timer lengths the user has adjusted; otherwise the length detected from the step text.
  const [stepSeconds, setStepSeconds] = useState<Record<number, number>>({});
  const [customMin, setCustomMin] = useState('');
  const [now, setNow] = useState(Date.now());
  const [noNotify, setNoNotify] = useState(false);
  const nextId = useRef(1);
  const timersRef = useRef<CookTimer[]>([]);
  timersRef.current = timers;

  useEffect(() => {
    configureNotifications();
    loadRecipe(id).then(setFull).catch((e) => setError(e.message));
  }, [id]);

  // Tick from stored end times, so timers stay correct even if the app was in the background.
  useEffect(() => {
    const t = setInterval(() => {
      const current = Date.now();
      setNow(current);
      const fired = timersRef.current.filter((x) => !x.done && x.endsAt <= current);
      if (fired.length) {
        Vibration.vibrate([0, 500, 250, 500, 250, 500]);
        setTimers((cur) => cur.map((x) => (!x.done && x.endsAt <= current ? { ...x, done: true } : x)));
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  // Scheduled notifications should not outlive cooking mode.
  useEffect(() => () => { timersRef.current.forEach((x) => cancelNotification(x.notificationId)); }, []);

  const startTimer = useCallback(async (label: string, seconds: number) => {
    const notificationId = await scheduleTimerNotification('Buko timer done', label, seconds);
    if (!notificationId) setNoNotify(true);
    setTimers((cur) => [...cur, { id: nextId.current++, label, endsAt: Date.now() + seconds * 1000, notificationId, done: false }]);
  }, []);

  function dismiss(t: CookTimer) {
    cancelNotification(t.notificationId);
    setTimers((cur) => cur.filter((x) => x.id !== t.id));
  }

  if (error) return <SafeAreaView style={{ flex: 1, padding: spacing.lg }}><Notice tone="danger">{error}</Notice></SafeAreaView>;
  if (!full) return <Loading />;

  const { recipe, steps, ingredients } = full;
  const cookServings = Number(servings) > 0 ? Number(servings) : recipe.servings;
  const current = steps[step];
  const last = step === steps.length - 1;

  function finish() {
    router.replace({ pathname: '/cook/finish', params: { id: recipe.id, servings: String(cookServings), ...(entry ? { entry } : {}) } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: recipe.title }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        <Text style={typography.label}>Step {step + 1} of {steps.length}</Text>
        <Pressable onPress={() => setShowIngredients((s) => !s)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="list-outline" size={18} color={colors.primary} />
          <Text style={[typography.body, { color: colors.primary, marginLeft: 4, fontWeight: '600' }]}>{showIngredients ? 'Hide' : 'Ingredients'}</Text>
        </Pressable>
      </View>
      <View style={{ height: 4, backgroundColor: colors.surfaceMuted, marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: 2 }}>
        <View style={{ height: 4, width: `${((step + 1) / steps.length) * 100}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}>
        {showIngredients ? (
          <Card>
            <Text style={typography.subheading}>Ingredients for {cookServings} serving{cookServings === 1 ? '' : 's'}</Text>
            <View style={{ height: spacing.sm }} />
            {ingredients.map((ing) => {
              const q = ing.quantity === null ? null : scaleQuantity(ing.quantity, recipe.servings, cookServings)!;
              return <Text key={ing.id} style={[typography.body, { paddingVertical: 3 }]}>• {q === null ? ing.raw_text : `${formatQuantity(q)}${ing.unit ? ' ' + ing.unit : ''} ${ing.name}`}</Text>;
            })}
          </Card>
        ) : null}

        <Text style={{ fontSize: 30, lineHeight: 42, fontWeight: '600', color: colors.text, marginTop: spacing.lg }}>{current?.text}</Text>

        {current?.timer_seconds ? (() => {
          const secs = stepSeconds[step] ?? current.timer_seconds!;
          const adjust = (delta: number) => setStepSeconds((c) => ({ ...c, [step]: Math.max(60, Math.min(24 * 3600, secs + delta)) }));
          return (
            <View style={{ marginTop: spacing.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.sm }}>
                <Pressable onPress={() => adjust(-60)} hitSlop={10} accessibilityLabel="One minute less"><Ionicons name="remove-circle-outline" size={32} color={colors.primary} /></Pressable>
                <Text style={typography.subheading}>{formatClock(secs)}</Text>
                <Pressable onPress={() => adjust(60)} hitSlop={10} accessibilityLabel="One minute more"><Ionicons name="add-circle-outline" size={32} color={colors.primary} /></Pressable>
              </View>
              <Button title={`Start ${formatClock(secs)} timer`} icon="timer-outline" onPress={() => startTimer(`Step ${step + 1}`, secs)} />
            </View>
          );
        })() : null}
      </ScrollView>

      {noNotify ? <View style={{ paddingHorizontal: spacing.lg }}><Notice>Notifications are off, so timers only alert you while Buko is open. You can allow them in Settings.</Notice></View> : null}

      <View style={{ paddingHorizontal: spacing.lg }}>
        {timers.map((t) => {
          const remaining = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
          return (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.done ? colors.dangerSoft : colors.primarySoft, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
              <Ionicons name={t.done ? 'alarm' : 'timer-outline'} size={22} color={t.done ? colors.danger : colors.primary} />
              <Text style={[typography.subheading, { marginLeft: spacing.sm, flex: 1 }]}>{t.label}</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: t.done ? colors.danger : colors.primary, marginRight: spacing.md }}>{t.done ? 'Done!' : formatClock(remaining)}</Text>
              <Pressable onPress={() => dismiss(t)} hitSlop={10} accessibilityLabel="Dismiss timer">
                <Ionicons name="close-circle" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={typography.small}>Custom:</Text>
          <TextInput
            value={customMin}
            onChangeText={(t) => setCustomMin(t.replace(/[^0-9]/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder="min"
            placeholderTextColor={colors.textMuted}
            style={[typography.body, { width: 64, textAlign: 'center', paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }]}
          />
          <Pressable
            disabled={!Number(customMin)}
            onPress={() => { startTimer(`${Number(customMin)} min timer`, Number(customMin) * 60); setCustomMin(''); }}
            style={{ paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: Number(customMin) ? colors.primary : colors.border }}
          >
            <Text style={[typography.body, { color: colors.surface, fontWeight: '600' }]}>Start</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={typography.small}>Quick timer:</Text>
          {[1, 5, 10, 15].map((m) => (
            <Pressable key={m} onPress={() => startTimer(`${m} min timer`, m * 60)} style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text style={typography.body}>{m}m</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}><Button title="Back" variant="secondary" onPress={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} /></View>
          <View style={{ flex: 2 }}>
            {last ? <Button title="Finish cooking" icon="checkmark" onPress={finish} /> : <Button title="Next step" onPress={() => setStep((s) => s + 1)} />}
          </View>
        </View>
        <Body muted>Screen stays awake while you cook.</Body>
      </View>
    </SafeAreaView>
  );
}
