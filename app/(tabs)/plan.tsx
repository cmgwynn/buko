import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type View as RNView } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroBar } from '../../src/components/MacroBar';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Empty, Notice } from '../../src/components/ui';
import { MEALS, toDateString } from '../../src/lib/diary';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import type { MealPlanEntry, Recipe, RecipeIngredient } from '../../src/lib/recipes/types';
import { dayStatus, weekDays, weekStart } from '../../src/lib/recipes/week';
import { addDays } from '../../src/lib/diary';
import { logPlanEntry } from '../../src/lib/recipes/logging';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';

type RecipeRow = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'grams' | 'nutrition'>[] };
type EntryRow = MealPlanEntry;

const STATUS_COLOR = { empty: colors.border, under: colors.score.mediocre, on: colors.score.excellent, over: colors.danger } as const;

export default function Plan() {
  const router = useRouter();
  const { session } = useAuth();
  const { targets } = useProfile();
  const today = toDateString(new Date());
  const [selected, setSelected] = useState(today);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<Meal | null>(null);
  const [dragging, setDragging] = useState<RecipeRow | null>(null);
  const [hover, setHover] = useState<Meal | null>(null);

  const start = weekStart(selected);
  const days = weekDays(start);

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([
      supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)').order('title'),
      supabase.from('meal_plan_entries').select('*').gte('planned_on', start).lte('planned_on', addDays(start, 6)).order('created_at'),
    ]);
    if (r.error || e.error) setError((r.error ?? e.error)!.message);
    else {
      setError(null);
      setRecipes(r.data as RecipeRow[]);
      setEntries(e.data as EntryRow[]);
    }
  }, [start]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Per-serving nutrition for every recipe, computed once per load.
  const perServing = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeRecipeNutrition>>();
    for (const r of recipes) m.set(r.id, computeRecipeNutrition(r.recipe_ingredients, r.servings));
    return m;
  }, [recipes]);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const dayTotals = useCallback(
    (date: string) =>
      entries.filter((e) => e.planned_on === date).reduce(
        (t, e) => {
          const n = perServing.get(e.recipe_id)?.perServing;
          if (!n) return t;
          return { calories: t.calories + n.calories * e.servings, protein: t.protein + n.protein_g * e.servings, carbs: t.carbs + n.carbs_g * e.servings, fat: t.fat + n.fat_g * e.servings };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [entries, perServing],
  );

  async function addEntry(recipeId: string, meal: Meal) {
    if (!session) return;
    const { error: e } = await supabase.from('meal_plan_entries').insert({ user_id: session.user.id, planned_on: selected, meal, recipe_id: recipeId, servings: 1 });
    if (e) setError(e.message);
    load();
  }

  async function logEntry(entry: EntryRow, recipe: RecipeRow) {
    if (!session) return;
    const err = await logPlanEntry(session.user.id, recipe, entry);
    if (err) setError(err);
    load();
  }

  async function setServings(entry: EntryRow, servings: number) {
    if (servings < 0.5) return;
    setEntries((cur) => cur.map((x) => (x.id === entry.id ? { ...x, servings } : x)));
    await supabase.from('meal_plan_entries').update({ servings }).eq('id', entry.id);
  }

  async function removeEntry(entry: EntryRow) {
    setEntries((cur) => cur.filter((x) => x.id !== entry.id));
    await supabase.from('meal_plan_entries').delete().eq('id', entry.id);
  }

  // Drag and drop ------------------------------------------------------------------------------
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const lastMove = useRef(0);
  const rootRef = useRef<RNView>(null);
  const slotRefs = useRef<Partial<Record<Meal, RNView | null>>>({});

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value - originX.value - 70 }, { translateY: dragY.value - originY.value - 24 }],
  }));

  function measureSlots(): Promise<{ meal: Meal; x: number; y: number; w: number; h: number }[]> {
    return Promise.all(
      MEALS.map(
        ({ key }) =>
          new Promise<{ meal: Meal; x: number; y: number; w: number; h: number }>((resolve) => {
            const ref = slotRefs.current[key];
            if (!ref) return resolve({ meal: key, x: -1, y: -1, w: 0, h: 0 });
            ref.measureInWindow((x, y, w, h) => resolve({ meal: key, x, y, w, h }));
          }),
      ),
    );
  }

  async function slotAt(x: number, y: number): Promise<Meal | null> {
    const rects = await measureSlots();
    return rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.meal ?? null;
  }

  const handlers = useRef({ begin: (_r: RecipeRow) => {}, move: (_x: number, _y: number) => {}, drop: (_r: RecipeRow, _x: number, _y: number) => {}, end: () => {} });
  handlers.current = {
    begin: (r) => {
      rootRef.current?.measureInWindow((x, y) => { originX.value = x; originY.value = y; });
      setDragging(r);
    },
    move: async (x, y) => {
      const t = Date.now();
      if (t - lastMove.current < 120) return;
      lastMove.current = t;
      setHover(await slotAt(x, y));
    },
    drop: async (r, x, y) => {
      const meal = await slotAt(x, y);
      if (meal) addEntry(r.id, meal);
    },
    end: () => { setDragging(null); setHover(null); },
  };

  const totals = dayTotals(selected);
  const status = targets ? dayStatus(totals.calories, targets.calories) : 'empty';
  const diff = targets ? Math.round(totals.calories - targets.calories) : 0;

  return (
    <View ref={rootRef} style={{ flex: 1, backgroundColor: colors.background }} collapsable={false}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <TabHeader
            title="Plan"
            right={
              <Pressable onPress={() => router.push({ pathname: '/grocery/generate', params: { week: start } })} hitSlop={10} accessibilityLabel="Make grocery list from this week">
                <Ionicons name="cart-outline" size={26} color={colors.primary} />
              </Pressable>
            }
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <Pressable onPress={() => setSelected(addDays(selected, -7))} hitSlop={12} accessibilityLabel="Previous week">
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <Text style={typography.subheading}>
              {new Date(start + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
              {new Date(addDays(start, 6) + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
            <Pressable onPress={() => setSelected(addDays(selected, 7))} hitSlop={12} accessibilityLabel="Next week">
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
            {days.map((d) => {
              const t = dayTotals(d);
              const st = targets ? dayStatus(t.calories, targets.calories) : 'empty';
              const isSel = d === selected;
              const dt = new Date(d + 'T00:00:00');
              return (
                <Pressable key={d} onPress={() => setSelected(d)} accessibilityLabel={dt.toDateString()}
                  style={{ alignItems: 'center', paddingVertical: 8, width: 44, borderRadius: radius.md, backgroundColor: isSel ? colors.primary : 'transparent' }}>
                  <Text style={[typography.small, isSel && { color: colors.onPrimary }]}>{dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                  <Text style={[typography.subheading, isSel && { color: colors.onPrimary }, d === today && !isSel && { color: colors.primary }]}>{dt.getDate()}</Text>
                  <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: isSel ? colors.onPrimary : STATUS_COLOR[st] }} />
                </Pressable>
              );
            })}
          </View>
        </View>

        <GHScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {targets ? (
            <Card>
              <Text style={typography.label}>Planned for this day vs. your targets</Text>
              <Text style={[typography.body, { marginVertical: spacing.sm, color: status === 'over' ? colors.danger : colors.text }]}>
                {totals.calories === 0
                  ? 'Nothing planned yet.'
                  : `${Math.round(totals.calories).toLocaleString()} of ${targets.calories.toLocaleString()} kcal · ${Math.abs(diff).toLocaleString()} ${diff > 0 ? 'over' : 'under'}`}
              </Text>
              <MacroBar label="Calories" unit="kcal" value={totals.calories} target={targets.calories} color={colors.macro.calories} />
              <MacroBar label="Protein" value={totals.protein} target={targets.protein_g} color={colors.macro.protein} />
              <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs_g} color={colors.macro.carbs} />
              <MacroBar label="Fat" value={totals.fat} target={targets.fat_g} color={colors.macro.fat} />
            </Card>
          ) : null}

          {MEALS.map(({ key, label }) => {
            const items = entries.filter((e) => e.planned_on === selected && e.meal === key);
            return (
              <View key={key} ref={(r) => { slotRefs.current[key] = r; }} collapsable={false}>
                <Card style={hover === key ? { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft } : undefined}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={typography.subheading}>{label}</Text>
                    <Pressable onPress={() => setPicker(key)} hitSlop={10} accessibilityLabel={`Add recipe to ${label}`}>
                      <Ionicons name="add-circle" size={26} color={colors.primary} />
                    </Pressable>
                  </View>
                  {items.length === 0 ? <Text style={[typography.small, { marginTop: spacing.xs }]}>Drop a recipe here or tap +</Text> : null}
                  {items.map((e) => {
                    const r = recipeById.get(e.recipe_id);
                    const n = perServing.get(e.recipe_id);
                    if (!r) return null;
                    return (
                      <View key={e.id} style={{ paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}>
                            <Text style={typography.body} numberOfLines={1}>{e.logged_at ? '✓ ' : ''}{r.title}</Text>
                            <Text style={typography.small}>{n && n.counted > 0 ? `${e.servings} serving${e.servings === 1 ? '' : 's'} · ${Math.round(n.perServing.calories * e.servings)} kcal` : 'No nutrition yet'}</Text>
                          </Pressable>
                          <Pressable onPress={() => setServings(e, e.servings - 0.5)} hitSlop={8} accessibilityLabel="Fewer servings"><Ionicons name="remove-circle-outline" size={24} color={colors.primary} /></Pressable>
                          <Text style={[typography.body, { marginHorizontal: 6, minWidth: 28, textAlign: 'center' }]}>{e.servings}</Text>
                          <Pressable onPress={() => setServings(e, e.servings + 0.5)} hitSlop={8} accessibilityLabel="More servings"><Ionicons name="add-circle-outline" size={24} color={colors.primary} /></Pressable>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: 4 }}>
                          {!e.logged_at ? (
                            <Pressable onPress={() => router.push({ pathname: '/cook/[id]', params: { id: r.id, servings: String(r.servings), entry: e.id } })} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name="flame-outline" size={16} color={colors.primary} />
                              <Text style={[typography.small, { color: colors.primary, marginLeft: 4 }]}>Cook</Text>
                            </Pressable>
                          ) : null}
                          {!e.logged_at ? (
                            <Pressable onPress={() => logEntry(e, r)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
                              <Text style={[typography.small, { color: colors.primary, marginLeft: 4 }]}>Log to diary</Text>
                            </Pressable>
                          ) : null}
                          <Pressable onPress={() => removeEntry(e)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                            <Text style={[typography.small, { marginLeft: 4 }]}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            );
          })}
        </GHScrollView>

        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
          <Text style={[typography.small, { paddingHorizontal: spacing.lg, marginBottom: spacing.xs }]}>
            {recipes.length ? 'Press and hold a recipe, then drag it onto a meal' : 'Add recipes in the Recipes tab to plan with them'}
          </Text>
          <GHScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {recipes.map((r) => (
              <DraggableChip key={r.id} recipe={r} dragX={dragX} dragY={dragY} handlers={handlers} />
            ))}
          </GHScrollView>
        </View>
      </SafeAreaView>

      {dragging ? (
        <Animated.View pointerEvents="none" style={[styles.ghost, overlayStyle]}>
          <Text style={{ color: colors.onPrimary, fontWeight: '600' }} numberOfLines={1}>{dragging.title}</Text>
        </Animated.View>
      ) : null}

      <Modal visible={picker !== null} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setPicker(null)} />
        <View style={{ backgroundColor: colors.background, maxHeight: '60%', padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <Text style={[typography.heading, { marginBottom: spacing.md }]}>Choose a recipe</Text>
          <GHScrollView>
            {recipes.length === 0 ? <Empty icon="restaurant-outline" text="No recipes yet." /> : null}
            {recipes.map((r) => (
              <Pressable key={r.id} onPress={() => { addEntry(r.id, picker!); setPicker(null); }}>
                <Card style={{ padding: spacing.md }}>
                  <Text style={typography.body}>{r.title}</Text>
                  <Text style={typography.small}>{(perServing.get(r.id)?.counted ?? 0) > 0 ? `${Math.round(perServing.get(r.id)!.perServing.calories)} kcal per serving` : 'No nutrition yet'}</Text>
                </Card>
              </Pressable>
            ))}
          </GHScrollView>
          <Button title="Cancel" variant="ghost" onPress={() => setPicker(null)} />
        </View>
      </Modal>
    </View>
  );
}

interface Handlers {
  current: {
    begin: (r: RecipeRow) => void;
    move: (x: number, y: number) => void;
    drop: (r: RecipeRow, x: number, y: number) => void;
    end: () => void;
  };
}

function DraggableChip({ recipe, dragX, dragY, handlers }: { recipe: RecipeRow; dragX: SharedValue<number>; dragY: SharedValue<number>; handlers: Handlers }) {
  // runOnJS keeps these callbacks on the JS thread, so they can use React state and refs directly.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(250)
    .onStart((e) => {
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      handlers.current.begin(recipe);
    })
    .onUpdate((e) => {
      dragX.value = e.absoluteX;
      dragY.value = e.absoluteY;
      handlers.current.move(e.absoluteX, e.absoluteY);
    })
    .onEnd((e, success) => {
      if (success) handlers.current.drop(recipe, e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      handlers.current.end();
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.chip} accessibilityHint="Press and hold, then drag onto a meal">
        <Text style={typography.body} numberOfLines={1}>{recipe.title}</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  chip: { maxWidth: 200, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  ghost: { position: 'absolute', left: 0, top: 0, width: 140, paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', opacity: 0.92 },
});
