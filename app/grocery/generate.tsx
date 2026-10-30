import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Disclosure, Empty, Loading, Notice, Screen } from '../../src/components/ui';
import { addDays, MEALS, toDateString } from '../../src/lib/diary';
import { buildGroceryList, type GeneratedItem } from '../../src/lib/recipes/grocery';
import { SECTIONS, type PantryItem, type Recipe, type RecipeIngredient } from '../../src/lib/recipes/types';
import { weekStart } from '../../src/lib/recipes/week';
import { config } from '../../src/lib/config';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { colors, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';

type RecipeRow = Recipe & { recipe_ingredients: RecipeIngredient[] };

export default function GenerateGrocery() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const params = useLocalSearchParams<{ week?: string }>();
  const [week, setWeek] = useState(params.week ?? weekStart(toDateString(new Date())));
  const [items, setItems] = useState<GeneratedItem[] | null>(null);
  const [meals, setMeals] = useState(0);
  const [pantryCount, setPantryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [selectedMeals, setSelectedMeals] = useState<Meal[]>(MEALS.map((m) => m.key));
  const request = useRef(0);

  const build = useCallback(async () => {
    const version = ++request.current;
    setItems(null);
    setError(null);
    if (!selectedDays.length || !selectedMeals.length) { setItems([]); setMeals(0); return; }
    const [e, p] = await Promise.all([
      supabase.from('meal_plan_entries').select('recipe_id, servings').in('planned_on', selectedDays.map((i) => addDays(week, i))).in('meal', selectedMeals).is('logged_at', null),
      supabase.from('pantry_items').select('*'),
    ]);
    if (version !== request.current) return;
    if (e.error || p.error) return setError((e.error ?? p.error)!.message);
    const planned = new Map<string, number>();
    for (const row of e.data as { recipe_id: string; servings: number }[]) {
      planned.set(row.recipe_id, (planned.get(row.recipe_id) ?? 0) + Number(row.servings));
    }
    setMeals((e.data as unknown[]).length);
    setPantryCount((p.data as unknown[]).length);
    let recipes: RecipeRow[] = [];
    if (planned.size) {
      const r = await supabase.from('recipes').select('*, recipe_ingredients(*)').in('id', [...planned.keys()]);
      if (version !== request.current) return;
      if (r.error) return setError(r.error.message);
      recipes = r.data as RecipeRow[];
    }
    setError(null);
    setItems(
      buildGroceryList(
        recipes.map((r) => ({
          title: r.title,
          servings: r.servings,
          plannedServings: planned.get(r.id) ?? 0,
          ingredients: [...r.recipe_ingredients].sort((a, b) => a.position - b.position).map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, section: i.section })),
        })),
        p.data as PantryItem[],
        profile?.units ?? 'metric',
      ),
    );
  }, [week, profile?.units, selectedDays, selectedMeals]);

  useEffect(() => { build(); }, [build]);

  async function save() {
    if (!session || !items) return;
    setBusy(true);
    setError(null);
    const result = await supabase.rpc('replace_generated_groceries', {
      p_week: week,
      p_expected_user_id: session.user.id,
      p_items: items.map((i) => ({
          name: i.name,
          quantity: i.display || null,
          quantity_value: i.amount,
          unit: i.baseUnit || null,
          section: i.section,
          from_recipes: i.fromRecipes,
      })),
    });
    if (result.error) {
      setError(result.error.code === 'PGRST202' ? 'Grocery generation needs database migration 0010. Your current list is unchanged.' : `Your current list is unchanged: ${result.error.message}`);
      setBusy(false); return;
    }
    setBusy(false);
    router.replace({ pathname: '/(tabs)/grocery', params: { added: String(items.length) } });
  }

  const label = `${new Date(week + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(addDays(week, 6) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        <Pressable accessibilityLabel="Previous week" onPress={() => setWeek(addDays(week, -7))} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Ionicons name="chevron-back" size={24} color={colors.primary} /></Pressable>
        <Text style={typography.heading}>{label}</Text>
        <Pressable accessibilityLabel="Next week" onPress={() => setWeek(addDays(week, 7))} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><Ionicons name="chevron-forward" size={24} color={colors.primary} /></Pressable>
      </View>
      <Disclosure title={`Choose days & meals · ${selectedDays.length} days`}>
        <ChipRow>{Array.from({ length: 7 }, (_, i) => {
          const date = new Date(`${addDays(week, i)}T12:00:00`);
          return <Chip key={i} label={date.toLocaleDateString(undefined, { weekday: 'short' })} selected={selectedDays.includes(i)}
            onPress={() => setSelectedDays((old) => old.includes(i) ? old.filter((d) => d !== i) : [...old, i])} />;
        })}</ChipRow>
        <ChipRow>{MEALS.map((meal) => <Chip key={meal.key} label={meal.label} selected={selectedMeals.includes(meal.key)}
          onPress={() => setSelectedMeals((old) => old.includes(meal.key) ? old.filter((m) => m !== meal.key) : [...old, meal.key])} />)}</ChipRow>
      </Disclosure>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {error ? <Button title="Retry preview" variant="secondary" onPress={() => { void build(); }} /> : null}
      {items === null && !error ? <Loading /> : null}
      {items ? (
        <>
          <Body muted>
            From {meals} planned meal{meals === 1 ? '' : 's'} that aren&apos;t cooked yet.
            {pantryCount ? ` Items in your pantry (${pantryCount}) have been subtracted.` : ''}
          </Body>
          <View style={{ height: spacing.md }} />
          {items.length === 0 ? <Empty icon="cart-outline" text="Nothing to buy for this week. Plan some recipes first, or your pantry already covers everything." /> : null}
          {SECTIONS.map(({ key, label: sectionLabel }) => {
            const inSection = items.filter((i) => i.section === key);
            if (!inSection.length) return null;
            return (
              <Card key={key}>
                <Text style={typography.label}>{sectionLabel}</Text>
                {inSection.map((i, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', paddingVertical: 6 }}>
                    <Text style={[typography.body, { flex: 1 }]}>{i.name}</Text>
                    <Text style={[typography.body, { color: colors.textMuted }]}>{i.display}</Text>
                  </View>
                ))}
              </Card>
            );
          })}
          <Notice tone="info">Adding replaces this week&apos;s earlier unchecked generated items. Items you added by hand or already checked off are kept.</Notice>
          <Button title={`Add ${items.length} item${items.length === 1 ? '' : 's'} to grocery list`} onPress={save} loading={busy} disabled={items.length === 0} />
          {config.groceryOrdering && items.length ? <Text style={[typography.small, { marginTop: spacing.xs }]}>Next: order them on Instacart in one tap.</Text> : null}
          <Button title="Manage pantry" variant="ghost" onPress={() => router.push('/pantry')} />
        </>
      ) : null}
    </Screen>
  );
}
