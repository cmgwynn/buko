import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Heading, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { editableRoutineItems, loadExercises, loadRoutines, saveRoutineTemplate, type RoutineRow } from '../../src/lib/fitness/data';
import { distanceUnit, weightUnit } from '../../src/lib/fitness/format';
import { STARTER_WORKOUTS, starterWorkoutExercises } from '../../src/lib/fitness/library';
import { routineExerciseForm, validateRoutine, type RoutineExerciseForm } from '../../src/lib/fitness/routines';
import type { Exercise } from '../../src/lib/fitness/types';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { spacing, typography } from '../../src/theme';

export default function EditRoutine() {
  const { id, template } = useLocalSearchParams<{ id?: string; template?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const units = profile?.units ?? 'metric';
  const [original, setOriginal] = useState<RoutineRow>();
  const [all, setAll] = useState<Exercise[]>([]);
  const [items, setItems] = useState<RoutineExerciseForm[]>([]);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([loadExercises(), id ? loadRoutines() : Promise.resolve([])]).then(([exercises, routines]) => {
      if (!live) return;
      setAll(exercises);
      const routine = id ? routines.find((row) => row.id === id) : undefined;
      const starter = template ? STARTER_WORKOUTS.find((row) => row.id === template) : undefined;
      if (id && !routine) throw new Error('That routine could not be found.');
      if (template && !starter) throw new Error('That workout idea could not be found.');
      setOriginal(routine);
      setName(routine?.name ?? starter?.name ?? '');
      const initial = routine ? editableRoutineItems(routine) : starter ? starterWorkoutExercises(starter, exercises) : [];
      setItems(initial.map((item, index) => routineExerciseForm(item, units, `loaded-${index}`)));
      setNeedsReload(false);
    }).catch((err) => {
      if (live) {
        setError(err instanceof Error ? err.message : 'Could not load routine.');
        setNeedsReload(true);
      }
    })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, template, units, reloadKey]);

  function patch(key: string, value: Partial<RoutineExerciseForm>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...value } : item));
  }

  function move(index: number, offset: number) {
    setItems((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  async function save() {
    if (busy) return;
    setError(null);
    const userId = session?.user.id;
    if (!userId) return setError('Please log in again to save a routine.');
    let validated;
    try {
      validated = validateRoutine(name, items, units);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check your routine details.');
      return;
    }
    setBusy(true);
    try {
      await saveRoutineTemplate(userId, name, validated, original);
      router.dismissTo('/(tabs)/train');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save routine.');
      setNeedsReload(true);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  return (
    <Screen variant="form">
      <Heading>{id ? 'Edit your routine' : 'Make a routine your own'}</Heading>
      <Body muted>Only future sessions change; logged and in-progress workouts stay unchanged.</Body>
      <Body muted>Targets are per set. Optional targets can stay blank.</Body>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {needsReload || (id && !original) ? <Button title="Reload routine" variant="secondary" onPress={() => setReloadKey((key) => key + 1)} /> : null}
      <View style={{ height: spacing.lg }} />
      <TextField label="Routine name" value={name} onChangeText={setName} maxLength={100} editable={!busy && !needsReload} />
      {items.map((item, index) => {
        const exercise = item.original.exercise;
        const editable = !busy && !needsReload;
        return (
          <Card key={item.key}>
            <Text style={typography.subheading}>{index + 1}. {exercise.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <Button title="Move up" variant="ghost" disabled={!editable || index === 0} onPress={() => move(index, -1)} />
              <Button title="Move down" variant="ghost" disabled={!editable || index === items.length - 1} onPress={() => move(index, 1)} />
              <Button title="Remove exercise" variant="danger" disabled={!editable} onPress={() => setItems((current) => current.filter((row) => row.key !== item.key))} />
            </View>
            <TextField label={`Sets for ${exercise.name}`} value={item.sets} keyboardType="number-pad" editable={editable} onChangeText={(sets) => patch(item.key, { sets })} />
            {exercise.category === 'strength' ? (
              <>
                <TextField label={`Reps for ${exercise.name}`} value={item.reps} keyboardType="number-pad" editable={editable} onChangeText={(reps) => patch(item.key, { reps })} />
                <TextField label={`Weight (${weightUnit(units)}) for ${exercise.name}`} value={item.weight} keyboardType="decimal-pad" editable={editable} onChangeText={(weight) => patch(item.key, { weight })} />
              </>
            ) : null}
            <TextField label={`Minutes per set for ${exercise.name}`} value={item.minutes} keyboardType="decimal-pad" editable={editable} onChangeText={(minutes) => patch(item.key, { minutes })} />
            {exercise.category === 'cardio' ? <TextField label={`Distance (${distanceUnit(units)}) per set for ${exercise.name}`} value={item.distance} keyboardType="decimal-pad" editable={editable} onChangeText={(distance) => patch(item.key, { distance })} /> : null}
          </Card>
        );
      })}
      <Button title={picking ? 'Close exercise picker' : 'Add exercise'} icon="add" variant="secondary" disabled={busy || needsReload} onPress={() => setPicking(!picking)} />
      {picking ? (
        <Card>
          <TextField label="Search exercises to add" value={query} onChangeText={setQuery} />
          {all.filter((exercise) => exercise.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 15).map((exercise) => (
            <Button key={exercise.id} title={`Add ${exercise.name}`} variant="ghost" disabled={busy || needsReload} onPress={() => {
              setItems((current) => [...current, routineExerciseForm({ exercise, sets: exercise.category === 'cardio' ? 1 : 3, reps: exercise.category === 'cardio' ? null : 8, weightKg: null, durationS: exercise.category === 'cardio' ? 600 : null, distanceM: null }, units, `added-${Date.now()}-${current.length}`)]);
              setPicking(false);
              setQuery('');
            }} />
          ))}
          {!all.some((exercise) => exercise.name.toLowerCase().includes(query.trim().toLowerCase())) ? <Body muted>No matching exercises.</Body> : null}
        </Card>
      ) : null}
      <Button title="Save routine" loading={busy} disabled={needsReload || (!!id && !original) || !items.length || !name.trim()} onPress={save} />
      <Button title="Back to Train" variant="ghost" disabled={busy} onPress={() => router.dismissTo('/(tabs)/train')} />
    </Screen>
  );
}
