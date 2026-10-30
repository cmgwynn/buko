import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { useBilling } from '../../providers/BillingProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { loadPlanningPreferences, savePlanningPreferences } from '../../lib/planning/preferences';
import { loadExercises, loadPlannedWorkouts, type PlannedWorkoutRow } from '../../lib/fitness/data';
import {
  generateTrainingPlan, prepareTrainingSave, trainingAddDays, trainingDate, TRAINING_DAYS,
  type TrainingDay, type TrainingInput, type TrainingPreview,
} from '../../lib/fitness/progression';
import { saveTrainingSlot } from '../../lib/fitness/progressionStorage';
import { getSession, workoutSessionStore } from '../../lib/fitness/session';
import { fromDisplayWeight, parseNum, toDisplayWeight, weightUnit } from '../../lib/fitness/format';
import { toDateString } from '../../lib/diary';
import type { Exercise, WorkoutSet } from '../../lib/fitness/types';
import { Button, Card, Chip, ChipRow, Disclosure, Eyebrow, Heading, Notice, TextField } from '../ui';
import { useConfirm } from '../ConfirmProvider';
import { colors, radius, spacing, typography } from '../../theme';

const KIND_ACCENT = { run: colors.primary, strength: colors.macro.protein, rest: colors.score.unknown } as const;

const numeric = (value: number | null) => value != null && Number.isFinite(value) ? String(value) : '';

function friendlyDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function nextMonday(today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return trainingAddDays(today, (8 - weekday) % 7 || 7);
}

export function WeeklyTrainingPlan({ disabled = false, autoOpen = false }: { disabled?: boolean; autoOpen?: boolean }) {
  const { session } = useAuth();
  const billing = useBilling();
  const router = useRouter();
  const userId = session?.user.id;
  const { profile } = useProfile();
  const units = profile?.units ?? 'metric';
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [savedExcluded, setSavedExcluded] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [input, setInput] = useState<TrainingInput>({
    startDate: trainingAddDays(toDateString(new Date()), 1), comfortableMinutes: 10,
    comfortableRunsPerWeek: 2, preferredRunDays: [1, 3, 6], runWalk: true, includeStrength: true,
  });
  const [preview, setPreview] = useState<TrainingPreview | null>(null);
  const [existing, setExisting] = useState<PlannedWorkoutRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const lock = useRef(false);
  const version = useRef(0);
  const account = useRef(userId);
  account.current = userId;
  useEffect(() => {
    version.current++;
    setOpen(false); setOwner(null); setCatalog([]); setExcluded([]); setSavedExcluded([]);
    setPreview(null); setExisting([]); setError(null); setStatus(null); setSearch(''); setSaveBlocked(false);
    return () => { version.current++; };
  }, [userId]);
  useEffect(() => {
    if (autoOpen && userId && !disabled && !open) void load();
    // Only open automatically on arrival; a user who closes the generator keeps it closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, userId, disabled]);
  function checkOwner(expected = userId) {
    if (!expected || expected !== account.current || workoutSessionStore.getAccount() !== expected) throw new Error('The account changed. Reload the generator.');
    if (getSession().active) throw new Error('Finish or discard your live workout before changing training plans.');
  }
  async function load() {
    if (lock.current || disabled) return;
    const request = ++version.current;
    lock.current = true; setBusy(true); setError(null);
    try {
      checkOwner();
      const [exercises, preferences] = await Promise.all([loadExercises(), loadPlanningPreferences(userId!)]);
      checkOwner();
      if (request !== version.current) return;
      setCatalog(exercises); setExcluded(preferences.excludedExercises); setSavedExcluded(preferences.excludedExercises);
      setOwner(userId!); setPreview(null); setExisting([]); setOpen(true); setStatus(null);
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Could not load training preferences.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const dirty = JSON.stringify(excluded) !== JSON.stringify(savedExcluded);
  async function saveExclusions() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    const request = version.current;
    try {
      checkOwner(owner ?? undefined);
      const latest = await loadPlanningPreferences(owner!);
      checkOwner(owner!);
      const saved = await savePlanningPreferences(owner!, { ...latest, excludedExercises: excluded });
      if (request !== version.current) return;
      setSavedExcluded(saved.excludedExercises); setExcluded(saved.excludedExercises);
      setPreview(null); setStatus('Exercise exclusions saved for this account. Generate a fresh preview.');
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Could not save exclusions.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function changeInput(patch: Partial<TrainingInput>) {
    setInput((value) => ({ ...value, ...patch })); setPreview(null); setStatus(null);
  }
  async function generate() {
    if (lock.current || dirty) return;
    lock.current = true; setBusy(true); setError(null); setStatus(null);
    const request = version.current;
    try {
      checkOwner();
      const preferences = await loadPlanningPreferences(userId!);
      checkOwner();
      const generated = generateTrainingPlan(input, catalog, preferences.excludedExercises, toDateString(new Date()));
      const plans = await loadPlannedWorkouts(input.startDate, trainingAddDays(input.startDate, 27));
      checkOwner();
      if (request !== version.current) return;
      setExisting(plans); setExcluded(preferences.excludedExercises); setSavedExcluded(preferences.excludedExercises);
      setPreview({ ...generated, days: generated.days.map((day) => ({
        ...day, save: day.save && !plans.some((plan) => plan.planned_for === day.date),
      })) });
      setSaveBlocked(false);
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Could not generate training preview.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function patchDay(index: number, patch: Partial<TrainingDay>) {
    setPreview((current) => current && ({ ...current, days: current.days.map((day, n) => n === index ? { ...day, ...patch } : day) }));
    setStatus(null);
  }
  function patchSet(dayIndex: number, itemIndex: number, setIndex: number, patch: Partial<WorkoutSet>) {
    const day = preview!.days[dayIndex];
    patchDay(dayIndex, { snapshot: day.snapshot.map((item, n) => n === itemIndex
      ? { ...item, sets: item.sets.map((set, s) => s === setIndex ? { ...set, ...patch } : set) } : item) });
  }
  async function save() {
    if (!preview || lock.current || dirty || saveBlocked) return;
    if (!billing.allowed) { router.push({ pathname: '/premium', params: { from: 'training-plan' } }); return; }
    lock.current = true; setBusy(true); setError(null); setStatus(null);
    const request = version.current;
    const savedDates: string[] = [];
    let writing = false;
    try {
      checkOwner();
      const selected = preview.days.filter((day) => day.save && day.kind !== 'rest');
      if (!selected.length) throw new Error('Select at least one workout to save.');
      const dates = selected.map((day) => day.date).sort();
      if (dates.some((date) => !Number.isFinite(trainingDate(date)))) throw new Error('Enter valid preview dates before saving.');
      const freshPreferences = await loadPlanningPreferences(userId!);
      checkOwner();
      const fresh = await loadPlannedWorkouts(dates[0], dates[dates.length - 1]);
      checkOwner();
      const operations = prepareTrainingSave(preview.days, fresh, existing, freshPreferences.excludedExercises, userId!, toDateString(new Date()), getSession().plannedWorkoutId);
      const replacements = operations.filter((operation) => operation.replace).length;
      if (!await confirm({
        title: 'Save this training schedule?',
        message: `Save ${operations.length} selected workouts; replace ${replacements} explicitly selected slots. All other plans, completed workouts and live sessions stay untouched. These are future targets, not logged training.`,
        confirmLabel: 'Confirm and save schedule',
      })) return;
      for (const operation of operations) {
        if (request !== version.current) throw new Error('The generator was closed. Remaining workouts were not saved.');
        checkOwner();
        writing = true;
        await saveTrainingSlot(userId!, operation);
        savedDates.push(operation.day.date);
        setPreview((current) => current && ({ ...current, days: current.days.map((day) => day.date === operation.day.date ? { ...day, save: false, replaceId: null } : day) }));
      }
      if (request === version.current) setStatus(`Saved ${savedDates.length} workouts. Find them under Planned workouts in Train on each date. Nothing was started or logged. Plan my week now adds more fuel on these days.`);
    } catch (e) {
      if (request === version.current) {
        setSaveBlocked(writing);
        setError(`${savedDates.length ? `${savedDates.length} workouts saved; they are now deselected. ` : ''}${e instanceof Error ? e.message : 'Could not save schedule.'}${writing ? ' Regenerate the preview before retrying: a disconnected request may have saved another slot.' : ''}`);
      }
    } finally { lock.current = false; setBusy(false); }
  }
  const off = busy || disabled;
  const today = toDateString(new Date());
  const selectedCount = preview?.days.filter((day) => day.save && day.kind !== 'rest').length ?? 0;
  return <Card>
    <Heading>Run + strength plan</Heading>
    <Text style={typography.small}>Four editable weeks for general fitness. Nothing is saved until you confirm.</Text>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {status ? <Notice tone="info">{status}</Notice> : null}
    {!open || owner !== userId ? <Button title="Build a weekly training plan" variant="secondary" loading={busy} disabled={disabled || !userId} onPress={() => { void load(); }} /> : <>
      <Eyebrow>1 · When to start</Eyebrow>
      <ChipRow>
        <Chip label="Tomorrow" selected={input.startDate === trainingAddDays(today, 1)} disabled={off} onPress={() => changeInput({ startDate: trainingAddDays(today, 1) })} />
        <Chip label="Next Monday" selected={input.startDate === nextMonday(today)} disabled={off} onPress={() => changeInput({ startDate: nextMonday(today) })} />
      </ChipRow>
      <TextField label="Training start date (YYYY-MM-DD)" value={input.startDate} editable={!off} onChangeText={(startDate) => changeInput({ startDate })} />
      <Eyebrow>2 · Your run days</Eyebrow>
      <ChipRow>{TRAINING_DAYS.map((day, index) => <Chip key={day} label={day} selected={input.preferredRunDays.includes(index)} disabled={off}
        onPress={() => changeInput({ preferredRunDays: input.preferredRunDays.includes(index) ? input.preferredRunDays.filter((value) => value !== index) : [...input.preferredRunDays, index] })} />)}</ChipRow>
      <Text style={typography.subheading}>Comfortable run sessions per week</Text>
      <ChipRow>{[1, 2, 3].map((count) => <Chip key={count} label={String(count)} selected={input.comfortableRunsPerWeek === count} disabled={off}
        onPress={() => changeInput({ comfortableRunsPerWeek: count })} />)}</ChipRow>
      <Eyebrow>3 · Where you are now</Eyebrow>
      <TextField label="Comfortable easy run/walk minutes (5–60)" keyboardType="decimal-pad" value={numeric(input.comfortableMinutes)} editable={!off}
        onChangeText={(value) => changeInput({ comfortableMinutes: parseNum(value) ?? NaN })} />
      <Text style={typography.small}>What feels easy today, not a goal. New to running? Keep run/walk on and start short.</Text>
      <ChipRow>
        <Chip label="Run / walk" selected={input.runWalk} disabled={off} onPress={() => changeInput({ runWalk: !input.runWalk })} />
        <Chip label="Include light strength" selected={input.includeStrength} disabled={off} onPress={() => changeInput({ includeStrength: !input.includeStrength })} />
      </ChipRow>
      <Disclosure title={`Exercises to skip${savedExcluded.length ? ` (${savedExcluded.length})` : ''}`}>
      <Text style={typography.small}>Skipped exercises are never generated. Existing plans and logs are unchanged.</Text>
      <TextField label="Find exercises to exclude" value={search} editable={!off} onChangeText={setSearch} />
      <ChipRow>{catalog.filter((exercise) => excluded.includes(exercise.id) || exercise.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => Number(excluded.includes(b.id)) - Number(excluded.includes(a.id))).slice(0, search ? 30 : Math.max(12, excluded.length))
        .map((exercise) => <Chip key={exercise.id} label={exercise.name} selected={excluded.includes(exercise.id)} disabled={off}
          onPress={() => { setExcluded((values) => values.includes(exercise.id) ? values.filter((id) => id !== exercise.id) : [...values, exercise.id]); setPreview(null); }} />)}</ChipRow>
      {excluded.filter((id) => !catalog.some((exercise) => exercise.id === id)).map((id) => <Button key={id} title={`Remove unavailable exclusion ${id}`} variant="ghost" disabled={off}
        onPress={() => { setExcluded((values) => values.filter((value) => value !== id)); setPreview(null); }} />)}
      <Button title="Save exercise exclusions" variant="secondary" disabled={off || !dirty} onPress={() => { void saveExclusions(); }} />
      </Disclosure>
      {dirty ? <Notice tone="info">Save your exercise changes to continue.</Notice> : null}
      <Button title="Preview my 4-week plan" loading={busy} disabled={disabled || dirty} onPress={() => { void generate(); }} />
      {preview ? <>
        <Heading>Review all four weeks</Heading>
        <Text style={typography.small}>{selectedCount} workouts selected. Tap a workout to adjust it, or skip it.</Text>
        <Disclosure title="Why this plan">
        {preview.rationale.map((reason) => <Text key={reason} style={[typography.small, { marginVertical: spacing.xs }]}>{reason}</Text>)}
        <Text style={typography.small}>Excluded: {preview.exclusions.join(', ') || 'none'}. Dates that already have a plan are skipped by default; you can add alongside or replace an uncompleted one. Edited targets can exceed the conservative defaults.</Text>
        </Disclosure>
        {preview.days.map((day, index) => <View key={index} style={{
          marginVertical: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background,
          borderLeftWidth: 4, borderLeftColor: KIND_ACCENT[day.kind], opacity: day.kind === 'rest' || !day.save ? 0.75 : 1,
        }}>
          <Eyebrow>Week {day.week} · {friendlyDate(day.date)}</Eyebrow>
          <Text style={[day.kind === 'rest' ? typography.body : typography.subheading, { marginTop: 2 }]}>{day.name}</Text>
          {day.kind === 'rest' ? null : <>
            <Text style={typography.small}>{day.snapshot.map((item) => item.exercise.name).join(' · ')}</Text>
            <Button title={`${day.save ? 'Skip' : 'Include'} workout ${index + 1}`} variant="ghost" disabled={off}
              onPress={() => patchDay(index, { save: !day.save, replaceId: null })} />
            {existing.filter((plan) => plan.planned_for === day.date).map((plan) => <View key={plan.id}>
              <Text style={typography.small}>Existing: {plan.name}{plan.completed_workout_id ? ' · completed, preserved' : ''}</Text>
              {!plan.completed_workout_id ? <Button title={`${day.replaceId === plan.id ? 'Keep' : 'Replace'} existing ${plan.name} on ${day.date}`}
                variant="ghost" disabled={off} onPress={() => patchDay(index, { replaceId: day.replaceId === plan.id ? null : plan.id, save: day.replaceId !== plan.id })} /> : null}
            </View>)}
            {day.save && !day.replaceId && existing.some((plan) => plan.planned_for === day.date) ? <Notice tone="info">This adds alongside existing plans; none will be replaced.</Notice> : null}
            <Disclosure title={`Adjust workout ${index + 1}`}>
            <Text style={typography.small}>{day.rationale}</Text>
            <TextField label={`Workout ${index + 1} date`} value={day.date} editable={!off} onChangeText={(date) => patchDay(index, { date, replaceId: null, save: false })} />
            <TextField label={`Workout ${index + 1} name`} value={day.name} maxLength={100} editable={!off} onChangeText={(name) => patchDay(index, { name })} />
            <TextField label={`Workout ${index + 1} notes`} value={day.notes} multiline maxLength={2000} editable={!off} onChangeText={(notes) => patchDay(index, { notes })} />
            <TextField label={`Find replacement exercises for workout ${index + 1}`} value={exerciseSearch} editable={!off} onChangeText={setExerciseSearch} />
            {day.snapshot.map((item, itemIndex) => <View key={itemIndex}>
              <Text style={typography.body}>{item.exercise.name}</Text>
              <ChipRow>{catalog.filter((exercise) => !savedExcluded.includes(exercise.id) && exercise.category === item.exercise.category
                && (day.kind !== 'run' || exercise.name.toLowerCase() === 'running')
                && (exercise.id === item.exercise.id || exercise.name.toLowerCase().includes(exerciseSearch.toLowerCase()))).slice(0, 6).map((exercise) => <Chip key={exercise.id} label={exercise.name}
                selected={item.exercise.id === exercise.id} disabled={off} onPress={() => patchDay(index, { snapshot: day.snapshot.map((value, n) => n === itemIndex ? { ...value, exercise } : value) })} />)}</ChipRow>
              {item.sets.map((set, setIndex) => <View key={setIndex}>
                {item.exercise.category === 'cardio'
                  ? <TextField label={`Workout ${index + 1} ${item.exercise.name} minutes`} value={numeric(set.duration_s == null ? null : set.duration_s / 60)} keyboardType="decimal-pad" editable={!off}
                    onChangeText={(value) => patchSet(index, itemIndex, setIndex, { duration_s: (parseNum(value) ?? NaN) * 60 })} />
                  : <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}><TextField label={`Workout ${index + 1} ${item.exercise.name} set ${setIndex + 1} reps`} value={numeric(set.reps)} keyboardType="number-pad" editable={!off}
                      onChangeText={(value) => patchSet(index, itemIndex, setIndex, { reps: parseNum(value) ?? NaN })} /></View>
                    <View style={{ flex: 1 }}><TextField label={`Workout ${index + 1} ${item.exercise.name} set ${setIndex + 1} ${weightUnit(units)}`} value={numeric(set.weight_kg == null ? null : toDisplayWeight(set.weight_kg, units))} keyboardType="decimal-pad" editable={!off}
                      onChangeText={(value) => patchSet(index, itemIndex, setIndex, { weight_kg: fromDisplayWeight(parseNum(value) ?? NaN, units) })} /></View>
                  </View>}
                <Button title={`Remove set ${setIndex + 1} from workout ${index + 1} ${item.exercise.name}`} variant="ghost" disabled={off || item.sets.length <= 1}
                  onPress={() => patchDay(index, { snapshot: day.snapshot.map((value, n) => n === itemIndex ? { ...value, sets: value.sets.filter((_, s) => s !== setIndex) } : value) })} />
              </View>)}
              {item.exercise.category === 'strength' ? <Button title={`Add set to workout ${index + 1} ${item.exercise.name}`} variant="ghost" disabled={off || item.sets.length >= 5}
                onPress={() => patchDay(index, { snapshot: day.snapshot.map((value, n) => n === itemIndex ? { ...value, sets: [...value.sets, { ...value.sets[value.sets.length - 1], position: value.sets.length }] } : value) })} /> : null}
              <Button title={`Remove ${item.exercise.name} from workout ${index + 1}`} variant="ghost" disabled={off || day.snapshot.length <= 1}
                onPress={() => patchDay(index, { snapshot: day.snapshot.filter((_, n) => n !== itemIndex) })} />
            </View>)}
            </Disclosure>
          </>}
        </View>)}
        {!billing.allowed ? <Text style={typography.small}>Previews are free. Saving generated plans is part of Buko Plus, with a free trial.</Text> : null}
        <Button title={billing.allowed ? `Save ${selectedCount} workouts to my plan` : 'Save with Buko Plus'} loading={busy} disabled={disabled || dirty || saveBlocked || !preview.days.some((day) => day.save)} onPress={() => { void save(); }} />
      </> : null}
      <Button title="Close training generator" variant="ghost" disabled={off} onPress={() => { version.current++; setOpen(false); setPreview(null); }} />
    </>}
  </Card>;
}
