import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, ChipRow, Notice, Screen, TextField } from '../../src/components/ui';
import { createExercise, loadExercises } from '../../src/lib/fitness/data';
import { addExercise, getSession, swapSessionExercise } from '../../src/lib/fitness/session';
import { MUSCLE_GROUPS, MUSCLE_LABEL, type Exercise, type MuscleGroup } from '../../src/lib/fitness/types';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, typography } from '../../src/theme';

export default function Exercises() {
  const router = useRouter();
  const { mode, item: itemKey } = useLocalSearchParams<{ mode?: string; item?: string }>();
  const swapping = mode === 'swap';
  const picking = mode === 'pick' || swapping;
  const original = swapping ? getSession().items.find((item) => item.key === itemKey) : null;
  const { session } = useAuth();
  const [all, setAll] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCategory, setNewCategory] = useState<'strength' | 'cardio'>('strength');
  const [newMuscles, setNewMuscles] = useState<MuscleGroup[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadExercises().then(setAll).catch((e) => setError(e.message));
    }, []),
  );

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter((e) => (!term || e.name.toLowerCase().includes(term)) && (!muscle || e.muscle_groups.includes(muscle))
        && (!swapping || (!!original && e.id !== original.exercise.id && e.category === original.exercise.category
          && e.muscle_groups.includes(original.exercise.muscle_groups[0]))))
      .sort((a, b) => Number(b.equipment === original?.exercise.equipment) - Number(a.equipment === original?.exercise.equipment))
      .slice(0, 80);
  }, [all, q, muscle, swapping, original]);

  function choose(e: Exercise) {
    if (picking) {
      try {
        if (swapping) {
          if (!itemKey) throw new Error('The exercise to replace is unavailable.');
          swapSessionExercise(itemKey, e);
        } else addExercise(e);
        router.back();
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not select this exercise.'); }
    } else {
      router.push({ pathname: '/exercise/[id]', params: { id: e.id } });
    }
  }

  async function create() {
    if (!session || !q.trim()) return;
    try {
      const e = await createExercise(session.user.id, {
        name: q.trim(),
        category: newCategory,
        muscle_groups: newCategory === 'cardio' ? ['cardio'] : newMuscles,
        equipment: null,
      });
      setCreating(false);
      setQ('');
      choose(e);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const exact = all.some((e) => e.name.toLowerCase() === q.trim().toLowerCase());

  return (
    <Screen>
      {swapping ? <Notice tone="info">Choose an exercise for the same primary muscles. Completed sets keep their original exercise; only remaining sets are swapped.</Notice> : null}
      <TextField placeholder="Search exercises" value={q} onChangeText={setQ} autoCorrect={false} />
      <ChipRow>
        <Chip label="All" selected={!muscle} onPress={() => setMuscle(null)} />
        {MUSCLE_GROUPS.map((m) => (
          <Chip key={m} label={MUSCLE_LABEL[m]} selected={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
      </ChipRow>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ height: spacing.md }} />
      {shown.map((e) => (
        <Pressable key={e.id} onPress={() => choose(e)}>
          <Card style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={typography.subheading}>{e.name}</Text>
              <Text style={typography.small}>
                {e.muscle_groups.map((m) => MUSCLE_LABEL[m] ?? m).join(', ')}
                {e.equipment ? ` · ${e.equipment}` : ''}
                {e.user_id ? ' · custom' : ''}
              </Text>
            </View>
            <Ionicons name={picking ? 'add-circle-outline' : 'chevron-forward'} size={22} color={colors.primary} />
          </Card>
        </Pressable>
      ))}
      {shown.length === 0 ? <Text style={[typography.small, { marginVertical: spacing.md }]}>No matches.</Text> : null}

      {q.trim() && !exact ? (
        creating ? (
          <Card>
            <Text style={typography.subheading}>New exercise: {q.trim()}</Text>
            <ChipRow>
              <Chip label="Strength" selected={newCategory === 'strength'} onPress={() => setNewCategory('strength')} />
              <Chip label="Cardio" selected={newCategory === 'cardio'} onPress={() => setNewCategory('cardio')} />
            </ChipRow>
            {newCategory === 'strength' ? (
              <>
                <Text style={[typography.label, { marginTop: spacing.sm }]}>Muscles worked (first is primary)</Text>
                <ChipRow>
                  {MUSCLE_GROUPS.filter((m) => m !== 'cardio').map((m) => (
                    <Chip
                      key={m}
                      label={MUSCLE_LABEL[m]}
                      selected={newMuscles.includes(m)}
                      onPress={() => setNewMuscles((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}
                    />
                  ))}
                </ChipRow>
              </>
            ) : null}
            <View style={{ height: spacing.md }} />
            <Button title="Create exercise" onPress={create} disabled={newCategory === 'strength' && newMuscles.length === 0} />
          </Card>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <Button title={`Create “${q.trim()}”`} icon="add" variant="secondary" onPress={() => setCreating(true)} />
          </View>
        )
      ) : null}
    </Screen>
  );
}
