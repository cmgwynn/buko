import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { deleteWorkoutPlan, loadWorkoutPlans, planWorkout, startPlannedWorkout, type PlannedWorkoutRow, type RoutineRow } from '../../lib/fitness/data';
import { useWorkoutRecovery, useWorkoutSession, workoutSessionStore } from '../../lib/fitness/session';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { useWorkoutMode } from '../../providers/WorkoutModeProvider';
import { Button, Card, Chip, ChipRow, Heading, Notice, TextField } from '../ui';
import { useConfirm } from '../ConfirmProvider';
import { spacing, typography } from '../../theme';

export function PlannedWorkouts({ routines }: { routines: RoutineRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { selectedDate } = useSelectedDate();
  const active = useWorkoutSession();
  const recovery = useWorkoutRecovery();
  const { online } = useWorkoutMode();
  const [plans, setPlans] = useState<PlannedWorkoutRow[]>([]);
  const [planning, setPlanning] = useState(false);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const lock = useRef(false);
  const currentDate = useRef(selectedDate);
  currentDate.current = selectedDate;
  const load = useCallback(async () => {
    const request = ++version.current;
    const date = currentDate.current;
    try {
      const rows = await loadWorkoutPlans(date);
      if (request === version.current && date === currentDate.current) { setPlans(rows); setError(null); }
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Could not load planned workouts.'); }
  }, [selectedDate]);
  useFocusEffect(useCallback(() => { setPlans([]); void load(); return () => { version.current++; }; }, [load]));
  async function save() {
    const routine = routines.find((row) => row.id === routineId);
    if (!routine || lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await planWorkout(routine, selectedDate, notes); setPlanning(false); setNotes(''); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not plan this workout.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function start(plan: PlannedWorkoutRow) {
    if (lock.current) return;
    if (active.active) { router.push('/workout/active'); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      await startPlannedWorkout(plan); await workoutSessionStore.retry();
      const saved = workoutSessionStore.getRecovery();
      if (saved.error) throw new Error(saved.error);
      router.push('/workout/active');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start the planned workout.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove(plan: PlannedWorkoutRow) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (!await confirm({ title: 'Remove planned workout?', message: `${plan.name} will be removed from ${selectedDate}. Completed workouts and the saved routine stay.`, confirmLabel: 'Remove plan', destructive: true })) return;
      await deleteWorkoutPlan(plan.id); await load();
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove the plan.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ marginTop: spacing.lg }}>
    <Heading>Planned workouts · {selectedDate}</Heading>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {plans.filter((plan) => plan.planned_for === selectedDate).map((plan) => <Card key={plan.id}>
      <Text style={typography.subheading}>{plan.name}</Text>
      {plan.notes ? <Text style={typography.small}>{plan.notes}</Text> : null}
      {plan.completed_workout_id ? <Button title="View completed workout" variant="secondary" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: plan.completed_workout_id! } })} />
        : <Button title={active.active ? 'Resume current workout' : `Start ${plan.name} now`} disabled={busy || !recovery.ready} onPress={() => { void start(plan); }} />}
      <Button title={`Remove plan for ${plan.name}`} variant="ghost" disabled={busy || online === false} onPress={() => { void remove(plan); }} />
    </Card>)}
    {planning ? <Card>
      <Text style={typography.subheading}>Plan a saved routine for {selectedDate}</Text>
      {!routines.length ? <Text style={typography.small}>Create a routine first.</Text> : <ChipRow>{routines.map((routine) => <Chip key={routine.id} label={routine.name} selected={routine.id === routineId} onPress={() => setRoutineId(routine.id)} />)}</ChipRow>}
      <TextField label="Plan notes (optional)" multiline maxLength={2000} value={notes} onChangeText={setNotes} />
      <Button title="Save workout plan" loading={busy} disabled={!routineId || online === false} onPress={() => { void save(); }} />
      {online === false ? <Notice tone="info">Planning changes need a connection. Previously cached plans can still start offline.</Notice> : null}
      <Button title="Cancel planning" variant="ghost" onPress={() => setPlanning(false)} />
    </Card> : <Button title="Plan a workout" variant="ghost" disabled={busy} onPress={() => setPlanning(true)} />}
  </View>;
}
