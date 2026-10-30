import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { useBilling } from '../../providers/BillingProvider';
import { useProfile } from '../../providers/ProfileProvider';
import { loadPlanningPreferences, savePlanningPreferences } from '../../lib/planning/preferences';
import { loadExercises, loadPlannedWorkouts, type PlannedWorkoutRow } from '../../lib/fitness/data';
import {
  generateTrainingPlan, prepareTrainingSave, trainingAddDays, trainingDate, TRAINING_DAYS, TRAINING_EQUIPMENT, TRAINING_SPLITS,
  type TrainingDay, type TrainingInput, type TrainingPreview,
} from '../../lib/fitness/progression';
import { saveTrainingSlot } from '../../lib/fitness/progressionStorage';
import { getSession, workoutSessionStore } from '../../lib/fitness/session';
import { fromDisplayWeight, parseNum, toDisplayWeight, weightUnit } from '../../lib/fitness/format';
import { toDateString } from '../../lib/diary';
import type { Exercise, WorkoutSet } from '../../lib/fitness/types';
import { Button, Card, Chip, ChipRow, Disclosure, Eyebrow, Heading, Notice, Step, TextField } from '../ui';
import { useConfirm } from '../ConfirmProvider';
import { DateField } from '../date/DateField';
import { colors, radius, spacing, typography } from '../../theme';

const KIND_ACCENT = { run: colors.primary, strength: colors.macro.protein, rest: colors.score.unknown } as const;

const numeric = (value: number | null) => value != null && Number.isFinite(value) ? String(value) : '';

function friendlyDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function shortDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : `${parsed.toLocaleDateString(undefined, { weekday: 'short' })} ${parsed.getDate()}`;
}

function IconAction({ icon, label, text, disabled, onPress }: {
  icon: ComponentProps<typeof Ionicons>['name']; label: string; text?: string; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
    style={{ minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, alignSelf: text ? 'flex-start' : 'auto', opacity: disabled ? 0.35 : 1 }}>
    <Ionicons name={icon} size={20} color={colors.primary} />
    {text ? <Text style={[typography.label, { color: colors.primary }]}>{text}</Text> : null}
  </Pressable>;
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
  function moveDay(from: number, to: number) {
    setPreview((current) => {
      if (!current) return current;
      const a = current.days[from].date, b = current.days[to].date;
      return { ...current, days: current.days.map((day, k) => k === from ? { ...day, date: b, save: true, replaceId: null } : k === to ? { ...day, date: a } : day) };
    });
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
  const workoutNumber = new Map((preview?.days ?? []).map((day, index) => ({ day, index })).filter(({ day }) => day.kind !== 'rest')
    .map(({ index }, k) => [index, k + 1] as const));
  const selectedCount = preview?.days.filter((day) => day.save && day.kind !== 'rest').length ?? 0;
  const splitOption = TRAINING_SPLITS.find((item) => item.key === (input.split ?? 'run'))!;
  const isRun = splitOption.key === 'run';
  const sessions = isRun ? input.comfortableRunsPerWeek : input.sessionsPerWeek ?? splitOption.defaultSessions;
  const sessionCounts = Array.from({ length: splitOption.sessions[1] - splitOption.sessions[0] + 1 }, (_, index) => splitOption.sessions[0] + index);
  return <Card>
    <Heading>Training plan</Heading>
    <Text style={typography.small}>Four weeks that build up, then ease off. You review before saving.</Text>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {status ? <Notice tone="info">{status}</Notice> : null}
    {!open || owner !== userId ? <Button title="Build a training plan" variant="secondary" loading={busy} disabled={disabled || !userId} onPress={() => { void load(); }} /> : <>
      <Step n={1}>Plan type</Step>
      <ChipRow>{TRAINING_SPLITS.map((item) => <Chip key={item.key} label={item.label} selected={splitOption.key === item.key} disabled={off}
        onPress={() => changeInput({ split: item.key, sessionsPerWeek: item.defaultSessions,
          preferredRunDays: item.key === 'run' ? [1, 3, 6] : item.defaultSessions >= 4 ? [1, 2, 4, 5] : [1, 3, 5] })} />)}</ChipRow>
      <Text style={typography.small}>{splitOption.hint}</Text>
      {!isRun ? <ChipRow>{TRAINING_EQUIPMENT.map((item) => <Chip key={item.key} label={item.label} selected={(input.equipment ?? 'gym') === item.key} disabled={off}
        onPress={() => changeInput({ equipment: item.key })} />)}</ChipRow> : null}
      <Step n={2}>Start</Step>
      <ChipRow>
        <Chip label="Tomorrow" selected={input.startDate === trainingAddDays(today, 1)} disabled={off} onPress={() => changeInput({ startDate: trainingAddDays(today, 1) })} />
        <Chip label="Next Monday" selected={input.startDate === nextMonday(today)} disabled={off} onPress={() => changeInput({ startDate: nextMonday(today) })} />
      </ChipRow>
      <DateField label="Or pick a start date" value={input.startDate} minDate={today} disabled={off} onChange={(startDate) => changeInput({ startDate })} />
      <Step n={3}>Days</Step>
      <ChipRow>{TRAINING_DAYS.map((day, index) => <Chip key={day} label={day} selected={input.preferredRunDays.includes(index)} disabled={off}
        onPress={() => changeInput({ preferredRunDays: input.preferredRunDays.includes(index) ? input.preferredRunDays.filter((value) => value !== index) : [...input.preferredRunDays, index] })} />)}</ChipRow>
      <Text style={typography.subheading}>{isRun ? 'Runs per week' : 'Sessions per week'}</Text>
      <ChipRow>{sessionCounts.map((count) => <Chip key={count} label={String(count)} selected={sessions === count} disabled={off}
        onPress={() => changeInput(isRun ? { comfortableRunsPerWeek: count } : { sessionsPerWeek: count })} />)}</ChipRow>
      {isRun ? <>
        <Step n={4}>Where you are now</Step>
        <TextField label="Easy run/walk minutes today (5–60)" keyboardType="decimal-pad" value={numeric(input.comfortableMinutes)} editable={!off}
          onChangeText={(value) => changeInput({ comfortableMinutes: parseNum(value) ?? NaN })} />
        <ChipRow>
          <Chip label="Run / walk" selected={input.runWalk} disabled={off} onPress={() => changeInput({ runWalk: !input.runWalk })} />
          <Chip label="Include light strength" selected={input.includeStrength} disabled={off} onPress={() => changeInput({ includeStrength: !input.includeStrength })} />
        </ChipRow>
      </> : null}
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
        <Text style={typography.small}>{selectedCount} workouts over 4 weeks. Open Edit workout to change or move one.</Text>
        <Disclosure title="Why this plan">
        {preview.rationale.map((reason) => <Text key={reason} style={[typography.small, { marginVertical: spacing.xs }]}>{reason}</Text>)}
        <Text style={typography.small}>Excluded: {preview.exclusions.join(', ') || 'none'}. Dates that already have a plan are skipped by default; you can add alongside or replace an uncompleted one. Edited targets can exceed the conservative defaults.</Text>
        </Disclosure>
        {[...new Set(preview.days.map((day) => day.week))].map((week) => {
          const inWeek = preview.days.map((day, index) => ({ day, index })).filter(({ day }) => day.week === week)
            .sort((a, b) => a.day.date.localeCompare(b.day.date));
          const rest = inWeek.filter(({ day }) => day.kind === 'rest');
          return <View key={week} style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text style={typography.subheading}>Week {week}{week === 4 ? ' · easier' : ''}</Text>
              {rest.length ? <Text style={[typography.small, { flexShrink: 1, textAlign: 'right' }]}>Rest {rest.map(({ day }) => shortDay(day.date)).join(', ')}</Text> : null}
            </View>
            {inWeek.filter(({ day }) => day.kind !== 'rest').map(({ day, index }) => {
              const n = workoutNumber.get(index)!;
              const conflicts = existing.filter((plan) => plan.planned_for === day.date);
              return <View key={index} style={{
                marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background,
                borderLeftWidth: 4, borderLeftColor: KIND_ACCENT[day.kind], opacity: day.save ? 1 : 0.7,
              }}>
                <Eyebrow>{friendlyDate(day.date)}</Eyebrow>
                <Text style={[typography.subheading, { marginTop: 2 }]}>{day.name}</Text>
                <Text style={typography.small}>{day.snapshot.map((item) => item.exercise.name).join(' · ')}</Text>
                {conflicts.length ? <View style={{ marginTop: spacing.sm }}>
                  <Text style={typography.small}>Already planned: {conflicts.map((plan) => `${plan.name}${plan.completed_workout_id ? ' (done)' : ''}`).join(', ')}</Text>
                  <ChipRow>
                    <Chip label="Keep existing" selected={!day.save} disabled={off} onPress={() => patchDay(index, { save: false, replaceId: null })} />
                    <Chip label="Add both" selected={day.save && !day.replaceId} disabled={off} onPress={() => patchDay(index, { save: true, replaceId: null })} />
                    {conflicts.filter((plan) => !plan.completed_workout_id).map((plan) => <Chip key={plan.id} label={`Replace ${plan.name}`}
                      selected={day.replaceId === plan.id} disabled={off} onPress={() => patchDay(index, { save: true, replaceId: plan.id })} />)}
                  </ChipRow>
                </View> : null}
                <Disclosure title="Edit workout">
                  <Text style={typography.small}>{day.rationale}</Text>
                  {rest.length ? <>
                    <Text style={[typography.label, { marginTop: spacing.sm }]}>Move to</Text>
                    <ChipRow>
                      {[{ day, index }, ...rest].sort((a, b) => a.day.date.localeCompare(b.day.date)).map(({ day: option, index: optionIndex }) => optionIndex === index
                        ? <Chip key={optionIndex} label={shortDay(option.date)} selected disabled={off} onPress={() => undefined} />
                        : <Chip key={optionIndex} label={shortDay(option.date)} disabled={off || option.date < today} onPress={() => moveDay(index, optionIndex)} />)}
                    </ChipRow>
                  </> : null}
                  <TextField label="Name" accessibilityLabel={`Workout ${n} name`} value={day.name} maxLength={100} editable={!off} onChangeText={(name) => patchDay(index, { name })} />
                  <TextField label="Notes" accessibilityLabel={`Workout ${n} notes`} value={day.notes} multiline maxLength={2000} editable={!off} onChangeText={(notes) => patchDay(index, { notes })} />
                  <TextField label="Swap an exercise" accessibilityLabel={`Find replacement exercises for workout ${n}`} placeholder="Search, e.g. squat" value={exerciseSearch} editable={!off} onChangeText={setExerciseSearch} />
                  {day.snapshot.map((item, itemIndex) => <View key={itemIndex} style={{ marginBottom: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[typography.subheading, { flex: 1 }]}>{item.exercise.name}</Text>
                      <IconAction icon="trash-outline" label={`Remove ${item.exercise.name} from workout ${n}`} disabled={off || day.snapshot.length <= 1}
                        onPress={() => patchDay(index, { snapshot: day.snapshot.filter((_, k) => k !== itemIndex) })} />
                    </View>
                    {exerciseSearch.trim() ? <ChipRow>{catalog.filter((exercise) => !savedExcluded.includes(exercise.id) && exercise.id !== item.exercise.id && exercise.category === item.exercise.category
                      && (day.kind !== 'run' || exercise.name.toLowerCase() === 'running')
                      && exercise.name.toLowerCase().includes(exerciseSearch.trim().toLowerCase())).slice(0, 4).map((exercise) => <Chip key={exercise.id} label={`⇄ ${exercise.name}`}
                      disabled={off} onPress={() => patchDay(index, { snapshot: day.snapshot.map((value, k) => k === itemIndex ? { ...value, exercise } : value) })} />)}</ChipRow> : null}
                    {item.sets.map((set, setIndex) => item.exercise.category === 'cardio'
                      ? <TextField key={setIndex} label="Minutes" accessibilityLabel={`Workout ${n} ${item.exercise.name} minutes`} value={numeric(set.duration_s == null ? null : set.duration_s / 60)} keyboardType="decimal-pad" editable={!off}
                        onChangeText={(value) => patchSet(index, itemIndex, setIndex, { duration_s: (parseNum(value) ?? NaN) * 60 })} />
                      : <View key={setIndex} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={[typography.label, { width: 44 }]}>Set {setIndex + 1}</Text>
                        <View style={{ flex: 1 }}><TextField placeholder="Reps" accessibilityLabel={`Workout ${n} ${item.exercise.name} set ${setIndex + 1} reps`} value={numeric(set.reps)} keyboardType="number-pad" editable={!off}
                          onChangeText={(value) => patchSet(index, itemIndex, setIndex, { reps: parseNum(value) ?? NaN })} /></View>
                        <View style={{ flex: 1 }}><TextField placeholder={weightUnit(units)} accessibilityLabel={`Workout ${n} ${item.exercise.name} set ${setIndex + 1} ${weightUnit(units)}`} value={numeric(set.weight_kg == null ? null : toDisplayWeight(set.weight_kg, units))} keyboardType="decimal-pad" editable={!off}
                          onChangeText={(value) => patchSet(index, itemIndex, setIndex, { weight_kg: value.trim() ? fromDisplayWeight(parseNum(value) ?? NaN, units) : null })} /></View>
                        <IconAction icon="close" label={`Remove set ${setIndex + 1} from workout ${n} ${item.exercise.name}`} disabled={off || item.sets.length <= 1}
                          onPress={() => patchDay(index, { snapshot: day.snapshot.map((value, k) => k === itemIndex ? { ...value, sets: value.sets.filter((_, s) => s !== setIndex) } : value) })} />
                      </View>)}
                    {item.exercise.category === 'strength' && item.sets.length < 5 ? <IconAction icon="add" text="Add set" label={`Add set to workout ${n} ${item.exercise.name}`} disabled={off}
                      onPress={() => patchDay(index, { snapshot: day.snapshot.map((value, k) => k === itemIndex ? { ...value, sets: [...value.sets, { ...value.sets[value.sets.length - 1], position: value.sets.length }] } : value) })} /> : null}
                  </View>)}
                </Disclosure>
              </View>;
            })}
          </View>;
        })}
        {!billing.allowed ? <Text style={typography.small}>Previews are free. Saving generated plans is part of Buko Plus, with a free trial.</Text> : null}
        <Button title={billing.allowed ? `Save ${selectedCount} workouts to my plan` : 'Save with Buko Plus'} loading={busy} disabled={disabled || dirty || saveBlocked || !preview.days.some((day) => day.save)} onPress={() => { void save(); }} />
      </> : null}
      <Button title="Close training generator" variant="ghost" disabled={off} onPress={() => { version.current++; setOpen(false); setPreview(null); }} />
    </>}
  </Card>;
}
