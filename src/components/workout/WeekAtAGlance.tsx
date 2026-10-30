import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addLocalDays, mondayOfWeek, parseLocalDate } from '../../lib/dates';
import { loadPlannedWorkouts, type PlannedWorkoutRow } from '../../lib/fitness/data';
import { useAuth } from '../../providers/AuthProvider';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { colors, radius, spacing, typography } from '../../theme';
import { Button, Card, Eyebrow } from '../ui';

type Kind = 'run' | 'strength' | 'other';
const KIND_COLOR: Record<Kind, string> = { run: colors.primary, strength: colors.macro.protein, other: colors.textMuted };

export function planKind(plan: Pick<PlannedWorkoutRow, 'snapshot'>): Kind {
  const items = plan.snapshot ?? [];
  if (items.some((item) => item.exercise?.name?.toLowerCase() === 'running')) return 'run';
  if (items.some((item) => item.exercise?.category === 'strength')) return 'strength';
  return 'other';
}

/** Runna-style week strip: what's planned each day, with the generator one tap away. */
export function WeekAtAGlance() {
  const router = useRouter();
  const { session } = useAuth();
  const { selectedDate, setSelectedDate, today } = useSelectedDate();
  const [plans, setPlans] = useState<PlannedWorkoutRow[] | null>(null);
  const version = useRef(0);
  const monday = mondayOfWeek(selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));

  const load = useCallback(async () => {
    const request = ++version.current;
    if (!session) { setPlans([]); return; }
    try {
      const rows = await loadPlannedWorkouts(monday, addLocalDays(monday, 6));
      if (request === version.current) setPlans(rows);
    } catch { if (request === version.current) setPlans([]); }
  }, [monday, session?.user.id]);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));

  if (plans === null) return null;
  const done = plans.filter((plan) => plan.completed_workout_id).length;

  if (!plans.length) {
    return <Card accent={colors.hero}>
      <Eyebrow>Personal plan</Eyebrow>
      <Text style={typography.subheading}>Build my training plan</Text>
      <Text style={typography.small}>Choose your run days. Buko ramps you up over 4 weeks.</Text>
      <Button title="Build my plan" icon="sparkles-outline" onPress={() => router.push('/workout/plan')} />
    </Card>;
  }

  return <Card accent={colors.hero}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Eyebrow>This week · {done}/{plans.length} done</Eyebrow>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit training plan" onPress={() => router.push('/workout/plan')} hitSlop={8}
        style={{ minHeight: 32, justifyContent: 'center' }}>
        <Text style={[typography.small, { color: colors.primary, fontWeight: '700' }]}>Edit plan</Text>
      </Pressable>
    </View>
    <View style={{ flexDirection: 'row', gap: 4, marginTop: spacing.sm }}>
      {days.map((day) => {
        const dayPlans = plans.filter((plan) => plan.planned_for === day);
        const selected = day === selectedDate;
        const completed = dayPlans.length > 0 && dayPlans.every((plan) => plan.completed_workout_id);
        const label = parseLocalDate(day).toLocaleDateString(undefined, { weekday: 'narrow' });
        const names = dayPlans.map((plan) => plan.name).join(', ') || 'Rest';
        return <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected }}
          accessibilityLabel={`${parseLocalDate(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${names}${completed ? ', done' : ''}`}
          onPress={() => setSelectedDate(day)}
          style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, minHeight: 64,
            backgroundColor: selected ? colors.hero : day === today ? colors.primarySoft : 'transparent' }}>
          <Text style={[typography.eyebrow, { color: selected ? colors.onHeroMuted : colors.textMuted }]}>{label}</Text>
          <Text style={[typography.subheading, { color: selected ? colors.onHero : colors.text }]}>{parseLocalDate(day).getDate()}</Text>
          <View style={{ flexDirection: 'row', gap: 2, marginTop: 4, minHeight: 14, alignItems: 'center' }}>
            {completed ? <Ionicons name="checkmark-circle" size={14} color={selected ? colors.heroAccent : colors.primary} />
              : dayPlans.slice(0, 2).map((plan) => <View key={plan.id} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selected ? colors.heroAccent : KIND_COLOR[planKind(plan)] }} />)}
          </View>
        </Pressable>;
      })}
    </View>
    <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs }}>
      <Legend color={KIND_COLOR.run} label="Run" />
      <Legend color={KIND_COLOR.strength} label="Strength" />
    </View>
  </Card>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    <Text style={typography.small}>{label}</Text>
  </View>;
}
