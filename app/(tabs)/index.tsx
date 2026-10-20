import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MacroBar } from '../../src/components/MacroBar';
import { TabHeader } from '../../src/components/TabHeader';
import { Card, Empty, Heading, Screen } from '../../src/components/ui';
import { addDays, formatDay, MEALS, toDateString } from '../../src/lib/diary';
import { supabase } from '../../src/lib/supabase';
import { useProfile } from '../../src/providers/ProfileProvider';
import { colors, spacing, typography } from '../../src/theme';
import type { FoodLogEntry } from '../../src/types';

export default function Diary() {
  const router = useRouter();
  const { targets } = useProfile();
  const [date, setDate] = useState(toDateString(new Date()));
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('food_log_entries').select('*').eq('logged_on', date).order('created_at');
    if (e) setError(e.message);
    else {
      setError(null);
      setEntries(data as FoodLogEntry[]);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totals = entries.reduce(
    (t, e) => ({ calories: t.calories + e.calories, protein: t.protein + e.protein_g, carbs: t.carbs + e.carbs_g, fat: t.fat + e.fat_g }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const remaining = targets ? targets.calories - totals.calories : 0;

  function confirmDelete(entry: FoodLogEntry) {
    Alert.alert('Remove entry?', entry.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('food_log_entries').delete().eq('id', entry.id);
          load();
        },
      },
    ]);
  }

  const isToday = date === toDateString(new Date());

  return (
    <Screen>
      <TabHeader title="Diary" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        <Pressable onPress={() => setDate(addDays(date, -1))} hitSlop={12} accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Heading>{formatDay(date)}</Heading>
        <Pressable onPress={() => setDate(addDays(date, 1))} disabled={isToday} hitSlop={12} accessibilityLabel="Next day" style={{ opacity: isToday ? 0.25 : 1 }}>
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {error ? <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text> : null}

      {targets ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 40, fontWeight: '800', color: remaining < 0 ? colors.danger : colors.primary }}>
              {Math.abs(Math.round(remaining)).toLocaleString()}
            </Text>
            <Text style={[typography.body, { marginLeft: spacing.sm }]}>kcal {remaining < 0 ? 'over' : 'remaining'}</Text>
          </View>
          <MacroBar label="Calories" unit="kcal" value={totals.calories} target={targets.calories} color={colors.macro.calories} />
          <MacroBar label="Protein" value={totals.protein} target={targets.protein_g} color={colors.macro.protein} />
          <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs_g} color={colors.macro.carbs} />
          <MacroBar label="Fat" value={totals.fat} target={targets.fat_g} color={colors.macro.fat} />
        </Card>
      ) : null}

      {MEALS.map(({ key, label }) => {
        const items = entries.filter((e) => e.meal === key);
        const kcal = items.reduce((s, e) => s + e.calories, 0);
        return (
          <Card key={key}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={typography.subheading}>{label}</Text>
              <Text style={typography.small}>{Math.round(kcal)} kcal</Text>
            </View>
            {items.map((e) => (
              <Pressable key={e.id} onLongPress={() => confirmDelete(e)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={typography.body} numberOfLines={1}>{e.name}</Text>
                  <Text style={typography.small}>
                    {Math.round(e.grams)} g · P {Math.round(e.protein_g)} · C {Math.round(e.carbs_g)} · F {Math.round(e.fat_g)}
                  </Text>
                </View>
                <Text style={typography.body}>{Math.round(e.calories)}</Text>
                <Pressable onPress={() => confirmDelete(e)} hitSlop={10} accessibilityLabel={`Remove ${e.name}`} style={{ marginLeft: spacing.md }}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            ))}
            <Pressable
              onPress={() => router.push({ pathname: '/log/search', params: { meal: key, date } })}
              style={{ flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm }}
            >
              <Ionicons name="add-circle" size={22} color={colors.primary} />
              <Text style={[typography.body, { color: colors.primary, marginLeft: spacing.sm, fontWeight: '600' }]}>Add food</Text>
            </Pressable>
          </Card>
        );
      })}
      {entries.length === 0 ? <Empty icon="restaurant-outline" text="Nothing logged yet. Add a food to a meal above." /> : null}
    </Screen>
  );
}
