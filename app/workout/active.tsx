import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, ChipRow, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { RecoveryNotice } from '../../src/components/RecoveryNotice';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { WorkoutSetRow } from '../../src/components/workout/WorkoutSetRow';
import { ExerciseDemo } from '../../src/components/workout/ExerciseDemo';
import {
  adjustSessionRest, blankSet, completeSessionSet, endSession, getSession, pauseSession, prefillSessionHistory,
  resumeSession, undoSessionSet, updateSession, useWorkoutRecovery, useWorkoutSession, workoutSessionStore,
} from '../../src/lib/fitness/session';
import { formatDuration } from '../../src/lib/fitness/format';
import type { WorkoutSet } from '../../src/lib/fitness/types';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useWorkoutMode } from '../../src/providers/WorkoutModeProvider';
import { setExerciseRest } from '../../src/lib/fitness/data';
import { colors, radius, spacing, typography } from '../../src/theme';

function Awake() { useKeepAwake('buko-focused-workout'); return null; }

export default function ActiveWorkout() {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  const confirm = useConfirm();
  const { profile, connectionError } = useProfile();
  const mode = useWorkoutMode();
  const w = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  const [now, setNow] = useState(Date.now());
  const [menu, setMenu] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const units = profile?.units ?? 'metric';
  useEffect(() => {
    if (!focused) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => clearInterval(clock);
  }, [focused]);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    // Explicit planned targets must not be overwritten by last-session history.
    if (!getSession().plannedWorkoutId) void prefillSessionHistory().catch((e: Error) => setError(e.message));
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(tabs)/train'); return true;
    });
    return () => { setFocused(false); back.remove(); };
  }, [router]));
  if (!recovery.ready) return <Screen><RecoveryNotice state={recovery} kind="Workout" retry={workoutSessionStore.retry} /></Screen>;
  if (!w.active) return <Screen><Heading>No workout in progress</Heading><Button title="Start workout" onPress={() => router.replace('/workout/start')} /></Screen>;
  const index = Math.min(w.focusIndex ?? 0, Math.max(0, w.items.length - 1));
  const item = w.items[index];
  const totalSets = w.items.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const completedSets = w.items.reduce((sum, exercise) => sum + exercise.sets.filter((set) => !!set.completed_at).length, 0);
  const elapsed = Math.max(0, Math.floor(((w.pausedAt ?? now) - w.startedAt - (w.totalPausedMs ?? 0)) / 1000));
  const rest = w.restEndsAt ? Math.max(0, Math.ceil((w.restEndsAt - now) / 1000)) : 0;
  const nextItem = w.items.slice(index + 1).find((exercise) => exercise.sets.some((set) => !set.completed_at))
    ?? w.items.slice(0, index).find((exercise) => exercise.sets.some((set) => !set.completed_at));
  function safe(action: () => void) {
    try { action(); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update your workout.'); }
  }
  function focus(value: number) { updateSession((session) => ({ ...session, focusIndex: value })); setShowDemo(false); }
  function patchSet(position: number, patch: Partial<WorkoutSet>) {
    if (!item || item.sets[position]?.completed_at) return;
    updateSession((session) => ({ ...session, items: session.items.map((exercise) => exercise.key === item.key
      ? { ...exercise, sets: exercise.sets.map((set, n) => n === position ? { ...set, ...patch } : set) } : exercise) }));
  }
  async function discard() {
    if (!await confirm({ title: 'Discard this workout?', message: 'This removes the active session on this device. Previously finished workouts are not affected.', destructive: true, confirmLabel: 'Discard workout' })) return;
    try { await endSession(); router.replace('/(tabs)/train'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not discard the workout.'); }
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    {focused && !w.pausedAt ? <Awake /> : null}
    <View style={{ paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPress={() => router.replace('/(tabs)/train')} accessibilityRole="button" accessibilityLabel="Minimize workout" style={{ minWidth: 56, minHeight: 56, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="chevron-down" size={28} color={colors.primary} />
        </Pressable>
        <View style={{ flex: 1 }}><Text style={typography.subheading} numberOfLines={1}>{w.name}</Text><Text style={[typography.body, { fontVariant: ['tabular-nums'] }]}>{formatDuration(elapsed)}{w.pausedAt ? ' · paused' : ''}</Text></View>
        <Button title="Finish" disabled={!completedSets || !!recovery.error} onPress={() => router.push('/workout/finish')} />
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel="Workout sets completed" accessibilityValue={{ min: 0, max: totalSets || 1, now: completedSets }}
        style={{ height: 10, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, overflow: 'hidden' }}>
        <View style={{ height: 10, width: `${totalSets ? completedSets / totalSets * 100 : 0}%`, backgroundColor: colors.primary }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.small}>{completedSets} / {totalSets} sets · {recovery.status === 'saving' ? 'Saving on device…' : recovery.error ? 'Device save needs attention' : 'Saved on device'}</Text>
        <Button title="Exercises" variant="ghost" onPress={() => setMenu(true)} />
      </View>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2, width: '100%', maxWidth: 620, alignSelf: 'center' }}>
      {connectionError ? <Notice tone="info">{connectionError}</Notice> : null}
      {mode.online === false ? <Notice tone="info">Offline workout: sets and notes save on this device. Finish normally; sync will retry when connected.</Notice> : null}
      {mode.native.liveActivity.status === 'error' ? <Notice tone="danger">{mode.native.liveActivity.reason ?? 'Live Activity could not update.'}</Notice> : null}
      {mode.native.alerts.status !== 'granted' ? <Button title="Enable rest alerts" variant="secondary" onPress={() => { void mode.native.enableAlerts().then((enabled) => { if (!enabled) setError('Rest alerts are unavailable or not permitted. The on-screen timer still works.'); }).catch((e: Error) => setError(e.message)); }} /> : null}
      <RecoveryNotice state={recovery} kind="Workout" retry={workoutSessionStore.retry} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {w.pausedAt ? <Card><Heading>Workout paused</Heading><Button title="Resume workout" onPress={() => safe(resumeSession)} /></Card> : null}
      {w.restEndsAt ? <Card>
        <Text style={typography.subheading}>{rest ? 'Rest' : 'Rest complete'}</Text>
        <Text accessibilityLiveRegion="none" style={{ fontSize: 48, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>{formatDuration(rest)}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Button title="−15 seconds" variant="secondary" onPress={() => safe(() => adjustSessionRest(-15))} /></View>
          <View style={{ flex: 1 }}><Button title="+15 seconds" variant="secondary" onPress={() => safe(() => adjustSessionRest(15))} /></View>
        </View>
        <Button title="Skip rest" variant="ghost" onPress={() => updateSession((session) => ({ ...session, restEndsAt: null }))} />
      </Card> : null}
      {item ? <>
        <Text style={typography.small}>Exercise {index + 1} of {w.items.length}{item.supersetId ? ' · superset' : ''}</Text>
        <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '800', color: colors.text, marginVertical: spacing.md }}>{item.exercise.name}</Text>
        <Button title={showDemo ? 'Hide demonstration' : 'Demonstration & form cues'} variant="secondary" onPress={() => setShowDemo(!showDemo)} />
        {showDemo ? <ExerciseDemo exercise={item.exercise} /> : null}
        <Text style={[typography.small, { marginVertical: spacing.md }]}>Suggested weights and reps come from your last saved session when available. Review them before tapping Done. Use 0 for bodyweight.</Text>
        {item.sets.map((set, position) => <WorkoutSetRow key={set.id ?? `${item.key}:${position}`} set={set} index={position} units={units}
          cardio={item.exercise.category === 'cardio'} completed={!!set.completed_at} onPatch={(patch) => safe(() => patchSet(position, patch))}
          onDone={() => safe(() => completeSessionSet(item.key, position))} onUndo={() => safe(() => undoSessionSet(item.key, position))}
          onRemove={() => updateSession((session) => ({ ...session, items: session.items.map((exercise) => exercise.key === item.key
            ? { ...exercise, sets: exercise.sets.filter((_, n) => n !== position).map((value, n) => ({ ...value, position: n })) } : exercise) }))} />)}
        {!w.pausedAt ? <Button title="Add set" variant="secondary" onPress={() => updateSession((session) => ({ ...session, items: session.items.map((exercise) => {
          if (exercise.key !== item.key) return exercise;
          const previous = exercise.sets.at(-1);
          return { ...exercise, sets: [...exercise.sets, blankSet(exercise.sets.length, previous ? { reps: previous.reps, weight_kg: previous.weight_kg, duration_s: previous.duration_s, distance_m: previous.distance_m } : undefined)] };
        }) }))} /> : null}
        <TextField label="Exercise notes" placeholder="Setup, form or adjustments" multiline maxLength={2000} value={item.notes ?? ''}
          onChangeText={(notes) => updateSession((session) => ({ ...session, items: session.items.map((exercise) => exercise.key === item.key ? { ...exercise, notes } : exercise) }))} />
        <Text style={typography.label}>Rest after sets</Text>
        <ChipRow>{[0, 30, 60, 90, 120, 180].map((seconds) => <Chip key={seconds} label={seconds ? `${seconds}s` : 'Off'} selected={(item.restSeconds ?? 90) === seconds}
          onPress={() => {
            updateSession((session) => ({ ...session, items: session.items.map((exercise) => exercise.key === item.key ? { ...exercise, restSeconds: seconds } : exercise) }));
            void setExerciseRest(item.exercise.id, seconds).catch((e: Error) => setError(e.message));
          }} />)}</ChipRow>
        <View style={{ height: spacing.md }} />
        <Button title="Swap exercise" variant="ghost" onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'swap', item: item.key } })} />
        <Button title={item.supersetId ? 'Remove from superset' : 'Superset with next exercise'} variant="ghost" disabled={!item.supersetId && !w.items[index + 1]}
          onPress={() => updateSession((session) => {
            const group = item.supersetId ? null : item.key;
            return { ...session, items: session.items.map((exercise, n) =>
              item.supersetId && exercise.supersetId === item.supersetId ? { ...exercise, supersetId: null }
                : n === index || (!item.supersetId && n === index + 1) ? { ...exercise, supersetId: group } : exercise) };
          })} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><Button title="Previous exercise" variant="secondary" disabled={index === 0} onPress={() => focus(index - 1)} /></View>
          <View style={{ flex: 1 }}><Button title="Next exercise" variant="secondary" disabled={index >= w.items.length - 1} onPress={() => focus(index + 1)} /></View>
        </View>
        <Text style={[typography.subheading, { marginVertical: spacing.lg }]}>Next up: {nextItem?.exercise.name ?? 'Finish and review'}</Text>
      </> : <Card><Heading>Your workout starts here</Heading><Text style={typography.body}>Choose exercises from your offline library.</Text><Button title="Add exercise" onPress={() => router.push({ pathname: '/workout/exercises', params: { mode: 'pick' } })} /></Card>}
      <Button title={w.pausedAt ? 'Resume workout' : 'Pause workout'} variant="secondary" onPress={() => safe(w.pausedAt ? resumeSession : pauseSession)} />
      <Button title="Discard workout" variant="ghost" onPress={() => { void discard(); }} />
    </ScrollView>
    <Modal visible={menu} animationType="slide" onRequestClose={() => setMenu(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <Heading>Workout exercises</Heading>
          {w.items.map((exercise, n) => <Card key={exercise.key}>
            <Text style={typography.subheading}>{exercise.exercise.name}</Text>
            <Text style={typography.small}>{exercise.sets.filter((set) => set.completed_at).length} / {exercise.sets.length} complete{exercise.supersetId ? ' · superset' : ''}</Text>
            <Button title={`Go to ${exercise.exercise.name}`} variant="secondary" onPress={() => { focus(n); setMenu(false); }} />
            <Button title={`Move ${exercise.exercise.name} up`} variant="ghost" disabled={n === 0} onPress={() => updateSession((session) => {
              const items = [...session.items]; [items[n - 1], items[n]] = [items[n], items[n - 1]];
              return { ...session, items, focusIndex: items.findIndex((value) => value.key === item?.key) };
            })} />
          </Card>)}
          <Button title="Add exercise" onPress={() => { setMenu(false); router.push({ pathname: '/workout/exercises', params: { mode: 'pick' } }); }} />
          <Button title="Back to workout" variant="ghost" onPress={() => setMenu(false)} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
