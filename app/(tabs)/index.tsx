import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { MacroBar } from '../../src/components/MacroBar';
import { TabHeader } from '../../src/components/TabHeader';
import { Card, CardGrid, Empty, Heading, Notice, Screen } from '../../src/components/ui';
import { addDays, formatDay, MEALS, toDateString } from '../../src/lib/diary';
import { activityAdjustedTargets } from '../../src/lib/fitness/calc';
import { loadBurnedForDay } from '../../src/lib/fitness/data';
import { loadActivityForDay, removeNutritionFromHealth, syncIfDue } from '../../src/lib/health';
import { logPlanEntry, type RecipeWithNutrition } from '../../src/lib/recipes/logging';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import type { MealPlanEntry } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSettings } from '../../src/providers/SettingsProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { FoodLogEntry } from '../../src/types';

export default function Diary() {
  const router = useRouter();
  const { targets: baseTargets, profile, age, birthdayError } = useProfile();
  const { settings } = useSettings();
  const [burned, setBurned] = useState(0);
  const { session } = useAuth();
  const [planned, setPlanned] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithNutrition[]>([]);
  const [date, setDate] = useState(toDateString(new Date()));
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [log, plan, rec] = await Promise.all([
      supabase.from('food_log_entries').select('*').eq('logged_on', date).order('created_at'),
      supabase.from('meal_plan_entries').select('*').eq('planned_on', date).is('logged_at', null).order('created_at'),
      supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)'),
    ]);
    if (log.error) setError(log.error.message);
    else {
      setError(null);
      setEntries(log.data as FoodLogEntry[]);
    }
    if (settings?.activity_adjust) {
      // Prefer the health app's active-energy total for the day; otherwise count workouts logged in Buko.
      const act = await loadActivityForDay(date);
      setBurned(act?.active_kcal != null ? Number(act.active_kcal) : await loadBurnedForDay(date));
    } else {
      setBurned(0);
    }
    if (!plan.error && !rec.error) {
      setPlanned(plan.data as MealPlanEntry[]);
      setRecipes(rec.data as RecipeWithNutrition[]);
    }
  }, [date, settings?.activity_adjust]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (session && settings) {
        syncIfDue(session.user.id, settings).then((did) => {
          if (did) load();
        });
      }
    }, [load, session, settings]),
  );

  const totals = entries.reduce(
    (t, e) => ({ calories: t.calories + e.calories, protein: t.protein + e.protein_g, carbs: t.carbs + e.carbs_g, fat: t.fat + e.fat_g }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const adjusted =
    settings?.activity_adjust && profile && baseTargets && age !== null
      ? activityAdjustedTargets(
          { goal: profile.goal, sex: profile.sex, age, heightCm: profile.height_cm, weightKg: profile.weight_kg, activityLevel: profile.activity_level },
          burned,
          settings.activity_share,
        )
      : null;
  const targets = adjusted ? { ...baseTargets!, calories: adjusted.calories, protein_g: adjusted.protein_g, carbs_g: adjusted.carbs_g, fat_g: adjusted.fat_g } : baseTargets;
  const remaining = targets ? targets.calories - totals.calories : 0;

  function confirmDelete(entry: FoodLogEntry) {
    Alert.alert('Remove entry?', entry.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.from('food_log_entries').delete().eq('id', entry.id);
          removeNutritionFromHealth(entry.health_external_id ?? null);
          load();
        },
      },
    ]);
  }

  async function logPlanned(entry: MealPlanEntry, recipe: RecipeWithNutrition) {
    if (!session) return;
    const err = await logPlanEntry(session.user.id, recipe, entry);
    if (err) Alert.alert('Could not log', err);
    load();
  }

  const isToday = date === toDateString(new Date());

  return (
    <Screen>
      <TabHeader title="Diary" />
      {birthdayError ? <Notice tone="danger">{birthdayError}</Notice> : null}
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
          <Text style={[typography.label, { marginBottom: spacing.sm }]}>Daily overview</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', marginBottom: spacing.xl }}>
            <Text style={{ fontSize: 44, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], color: remaining < 0 ? colors.danger : colors.primary }}>
              {Math.abs(Math.round(remaining)).toLocaleString()}
            </Text>
            <Text style={[typography.body, { marginLeft: spacing.sm }]}>kcal {remaining < 0 ? 'over' : 'remaining'}</Text>
          </View>
          {adjusted ? (
            <Text style={[typography.small, { marginBottom: spacing.md }]}>
              {adjusted.baseCalories.toLocaleString()} base + {adjusted.bonusKcal.toLocaleString()} from activity ({Math.round((settings?.activity_share ?? 0) * 100)}% of {Math.round(burned)} kcal burned)
              {adjusted.floorApplied ? ' · your base target is held at the safe minimum' : ''}
            </Text>
          ) : null}
          <MacroBar label="Calories" unit="kcal" value={totals.calories} target={targets.calories} color={colors.macro.calories} />
          <MacroBar label="Protein" value={totals.protein} target={targets.protein_g} color={colors.macro.protein} />
          <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs_g} color={colors.macro.carbs} />
          <MacroBar label="Fat" value={totals.fat} target={targets.fat_g} color={colors.macro.fat} />
        </Card>
      ) : null}

      <CardGrid>{MEALS.map(({ key, label }) => {
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
            {planned.filter((p) => p.meal === key).map((p) => {
              const r = recipes.find((x) => x.id === p.recipe_id);
              if (!r) return null;
              const n = computeRecipeNutrition(r.recipe_ingredients, r.servings);
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, opacity: 0.9 }}>
                  <Ionicons name="calendar-outline" size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body} numberOfLines={1}>{r.title}</Text>
                    <Text style={typography.small}>Planned · {p.servings} serving{p.servings === 1 ? '' : 's'}{n.counted > 0 ? ` · ${Math.round(n.perServing.calories * p.servings)} kcal` : ''}</Text>
                  </View>
                  <Pressable onPress={() => logPlanned(p, r)} disabled={n.counted === 0} style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: n.counted > 0 ? colors.primary : colors.border }}>
                    <Text style={[typography.small, { color: colors.surface, fontWeight: '700' }]}>Log</Text>
                  </Pressable>
                </View>
              );
            })}
            <Pressable
              onPress={() => router.push({ pathname: '/log/recipes', params: { meal: key, date } })}
              style={{ flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm }}
            >
              <Ionicons name="book-outline" size={20} color={colors.primary} />
              <Text style={[typography.body, { color: colors.primary, marginLeft: spacing.sm, fontWeight: '600' }]}>Add recipe</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/log/search', params: { meal: key, date } })}
              style={{ flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm }}
            >
              <Ionicons name="add-circle" size={22} color={colors.primary} />
              <Text style={[typography.body, { color: colors.primary, marginLeft: spacing.sm, fontWeight: '600' }]}>Add food</Text>
            </Pressable>
          </Card>
        );
      })}</CardGrid>
      {entries.length === 0 ? <Empty icon="restaurant-outline" text="Nothing logged yet. Add a food to a meal above." /> : null}
    </Screen>
  );
}
