import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type View as RNView } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroBar } from '../../src/components/MacroBar';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Disclosure, Loading, Notice } from '../../src/components/ui';
import { PlanRecipePicker, type PlanChoice } from '../../src/components/PlanRecipePicker';
import { DateNavigator } from '../../src/components/date/DateNavigator';
import { DaySwipe } from '../../src/components/date/DaySwipe';
import { invalidateDateHistory } from '../../src/components/date/dateHistory';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { formatDay, MEALS } from '../../src/lib/diary';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import type { MealPlanEntry, Recipe, RecipeIngredient } from '../../src/lib/recipes/types';
import { mondayOfWeek } from '../../src/lib/dates';
import { addDays } from '../../src/lib/diary';
import { logPlanEntry } from '../../src/lib/recipes/logging';
import { saveRecipe } from '../../src/lib/recipes/db';
import { repeatPlanRows } from '../../src/lib/recipes/repeat';
import type { RecipeDraft } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSelectedDate } from '../../src/providers/SelectedDateProvider';
import { colors, layout, radius, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';
import { PremiumGate } from '../../src/components/PremiumGate';

type RecipeRow = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'grams' | 'nutrition'>[] };
type EntryRow = MealPlanEntry;

export default function Plan() {
  return <PremiumGate feature="Meal planning"><PlanContent /></PremiumGate>;
}
function PlanContent() {
  const router = useRouter();
  const confirm = useConfirm();
  const { session } = useAuth();
  const { targets } = useProfile();
  const { selectedDate: selected, setSelectedDate: setSelected } = useSelectedDate();
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<Meal | null>(null);
  const [dragging, setDragging] = useState<RecipeRow | null>(null);
  const [hover, setHover] = useState<Meal | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [removed, setRemoved] = useState<EntryRow | null>(null);
  const copies = useRef(new WeakMap<RecipeDraft, string>());
  const requestVersion = useRef(0);
  const mutation = useRef(false);

  const start = mondayOfWeek(selected);

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!session) { setRecipes([]); setEntries([]); return; }
    try {
      const [r, e] = await Promise.all([
        supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)').eq('user_id', session.user.id).order('title'),
        supabase.from('meal_plan_entries').select('*').eq('user_id', session.user.id).gte('planned_on', start).lte('planned_on', addDays(start, 6)).order('created_at'),
      ]);
      if (request !== requestVersion.current) return;
      if (r.error || e.error) setError((r.error ?? e.error)!.message);
      else {
        setError(null);
        setRecipes(r.data as RecipeRow[]);
        setEntries(e.data as EntryRow[]);
      }
    } catch (err) {
      if (request === requestVersion.current) setError((err as Error).message);
    }
    if (request === requestVersion.current) setLoaded(true);
  }, [session?.user.id, start]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]));

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
          if (!n || !perServing.get(e.recipe_id)?.complete) return t;
          return { calories: t.calories + n.calories * e.servings, protein: t.protein + n.protein_g * e.servings, carbs: t.carbs + n.carbs_g * e.servings, fat: t.fat + n.fat_g * e.servings };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [entries, perServing],
  );

  async function addEntry(recipeId: string, meal: Meal) {
    if (!session || mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    const { error: e } = await supabase.from('meal_plan_entries').insert({ user_id: session.user.id, planned_on: selected, meal, recipe_id: recipeId, servings: 1 });
    if (e) setError(`Meal was not saved: ${e.message}`);
    else { setMessage('Meal saved.'); await load(); }
    mutation.current = false; setPending(false);
  }

  async function logEntry(entry: EntryRow, recipe: RecipeRow) {
    if (!session || mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    const err = await logPlanEntry(session.user.id, recipe, entry);
    if (err) setError(err);
    else { invalidateDateHistory(); setMessage('Meal logged to Diary.'); await load(); }
    mutation.current = false; setPending(false);
  }

  async function setServings(entry: EntryRow, servings: number) {
    if (servings < 0.5 || servings > 100 || mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    const { error: e } = await supabase.from('meal_plan_entries').update({ servings }).eq('id', entry.id);
    if (e) setError(`Portion change was not saved: ${e.message}`);
    else { setEntries((cur) => cur.map((x) => (x.id === entry.id ? { ...x, servings } : x))); setMessage('Servings saved.'); }
    mutation.current = false; setPending(false);
  }

  async function removeEntry(entry: EntryRow) {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    const { error: e } = await supabase.from('meal_plan_entries').delete().eq('id', entry.id);
    if (e) setError(`Meal was not removed: ${e.message}`);
    else { setEntries((cur) => cur.filter((x) => x.id !== entry.id)); setRemoved(entry); setMessage('Meal removed.'); }
    mutation.current = false; setPending(false);
  }

  async function undoRemove() {
    if (!removed || mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    const { error: e } = await supabase.from('meal_plan_entries').insert(removed);
    if (e) setError(`Could not restore meal: ${e.message}`);
    else { setRemoved(null); setMessage('Meal restored.'); await load(); }
    mutation.current = false; setPending(false);
  }
  async function addChoice(choice: PlanChoice, servings: number) {
    if (!session || !picker || mutation.current) return false;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    try {
      let id = choice.id;
      if (choice.draft) {
        id = copies.current.get(choice.draft);
        if (!id) { id = await saveRecipe(session.user.id, choice.draft); copies.current.set(choice.draft, id); }
      }
      const { error: e } = await supabase.from('meal_plan_entries').insert({ user_id: session.user.id, planned_on: selected, meal: picker, recipe_id: id, servings });
      if (e) throw new Error(`${choice.draft ? 'Your private copy was saved, but the meal was not added. Retry without making another copy. ' : ''}${e.message}`);
      setMessage('Recipe saved to your meal plan.'); await load();
      return true;
    } finally { mutation.current = false; setPending(false); }
  }
  async function repeat(scope: 'day' | 'week' | Meal) {
    if (!session || mutation.current) return;
    const isMeal = scope !== 'day' && scope !== 'week';
    const sourceDate = isMeal ? addDays(selected, -1) : selected;
    let source = entries.filter((e) => scope === 'week' || e.planned_on === sourceDate);
    if (isMeal) {
      const result = await supabase.from('meal_plan_entries').select('*').eq('planned_on', sourceDate).eq('meal', scope);
      if (result.error) { setError(result.error.message); return; }
      source = result.data as EntryRow[];
    }
    if (!source.length) { setError('There are no meals to copy from that day or week.'); return; }
    if (!await confirm({ title: 'Copy planned meals?', message: `${source.length} meal${source.length === 1 ? '' : 's'} will be added ${scope === 'week' ? 'to next week' : isMeal ? 'to this meal today' : 'to tomorrow'}. Existing meals stay; copied meals are not marked as logged.`, confirmLabel: 'Copy meals' })) return;
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    const { error: e } = await supabase.from('meal_plan_entries').insert(repeatPlanRows(source, session.user.id, scope === 'week' ? 7 : 1));
    if (e) setError(`Meals were not copied: ${e.message}`);
    else { setMessage('Meals copied.'); if (scope === 'week') setSelected(addDays(selected, 7)); else if (scope === 'day') setSelected(addDays(selected, 1)); else await load(); }
    mutation.current = false; setPending(false);
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

  return (
    <View ref={rootRef} style={{ flex: 1, backgroundColor: colors.background }} collapsable={false}>
      <SafeAreaView style={{ flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' }} edges={['top', 'left', 'right']}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <TabHeader
            title="Plan"
            right={
              <>
                <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/grocery')} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Open groceries">
                  <Ionicons name="cart-outline" size={22} color={colors.primary} />
                  <Text style={{ ...typography.small, color: colors.primary }}>Groceries</Text>
                </Pressable>
              </>
            }
          />
          <DateNavigator />
        </View>

        <DaySwipe>
        <GHScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {error ? <Button title="Retry loading plan" variant="ghost" onPress={() => { void load(); }} /> : null}
          {pending ? <Notice tone="info">Saving…</Notice> : message ? <Notice tone="info">{message}</Notice> : null}
          {removed ? <Button title="Undo remove meal" variant="ghost" disabled={pending} onPress={() => { void undoRemove(); }} /> : null}
          {!loaded ? <Loading /> : null}
          {targets ? (
            <Card>
              <Text style={typography.label}>Planned {formatDay(selected)}</Text>
              <Text style={[typography.body, { marginVertical: spacing.sm }]}>
                {totals.calories === 0
                  ? 'Nothing planned yet.'
                  : `${Math.round(totals.calories).toLocaleString()} kcal · Target ${targets.calories.toLocaleString()} kcal`}
              </Text>
              {entries.some((e) => e.planned_on === selected && !perServing.get(e.recipe_id)?.complete) ? <Text style={typography.small}>Partial estimate: meals with incomplete nutrition are excluded.</Text> : null}
              <Disclosure title="Macro breakdown">
              <MacroBar label="Calories" unit="kcal" value={totals.calories} target={targets.calories} color={colors.macro.calories} />
              <MacroBar label="Protein" value={totals.protein} target={targets.protein_g} color={colors.macro.protein} />
              <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs_g} color={colors.macro.carbs} />
              <MacroBar label="Fat" value={totals.fat} target={targets.fat_g} color={colors.macro.fat} />
              </Disclosure>
            </Card>
          ) : null}

          {MEALS.map(({ key, label }) => {
            const items = entries.filter((e) => e.planned_on === selected && e.meal === key);
            return (
              <View key={key} ref={(r) => { slotRefs.current[key] = r; }} collapsable={false}>
                <Card style={hover === key ? { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft } : undefined}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={typography.subheading}>{label}</Text>
                    <Pressable accessibilityRole="button" onPress={() => setPicker(key)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Add recipe to ${label}`}>
                      <Ionicons name="add-circle" size={26} color={colors.primary} />
                    </Pressable>
                  </View>
                  {items.length === 0 ? <Text style={[typography.small, { marginTop: spacing.xs }]}>Tap + to find a recipe. Dragging saved recipes is optional.</Text> : null}
                  {items.map((e) => {
                    const r = recipeById.get(e.recipe_id);
                    const n = perServing.get(e.recipe_id);
                    if (!r) return null;
                    return (
                      <View key={e.id} style={{ paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}>
                            <Text style={typography.body} numberOfLines={1}>{e.logged_at ? '✓ ' : ''}{r.title}</Text>
                            <Text style={typography.small}>{n?.complete ? `${e.servings} serving${e.servings === 1 ? '' : 's'} · ${Math.round(n.perServing.calories * e.servings)} kcal` : `${e.servings} servings · Nutrition incomplete`}</Text>
                          </Pressable>
                          <Pressable accessibilityRole="button" disabled={pending} onPress={() => setServings(e, e.servings - 0.5)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Fewer servings"><Ionicons name="remove-circle-outline" size={24} color={colors.primary} /></Pressable>
                          <Text style={[typography.body, { marginHorizontal: 6, minWidth: 28, textAlign: 'center' }]}>{e.servings}</Text>
                          <Pressable accessibilityRole="button" disabled={pending} onPress={() => setServings(e, e.servings + 0.5)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="More servings"><Ionicons name="add-circle-outline" size={24} color={colors.primary} /></Pressable>
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
                          <Pressable accessibilityRole="button" disabled={pending} onPress={() => removeEntry(e)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                            <Text style={[typography.small, { marginLeft: 4 }]}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                  <Button title="Copy from previous day" variant="ghost" disabled={pending} onPress={() => { void repeat(key); }} />
                </Card>
              </View>
            );
          })}
          <Disclosure title="Repeat your plan">
            <Button title="Copy this day to tomorrow" variant="secondary" disabled={pending} onPress={() => { void repeat('day'); }} />
            <Button title="Repeat this week next week" variant="secondary" disabled={pending} onPress={() => { void repeat('week'); }} />
          </Disclosure>
          <Button title="Generate groceries" icon="cart-outline" variant="secondary" onPress={() => router.push({ pathname: '/grocery/generate', params: { week: start } })} />
        </GHScrollView>
        </DaySwipe>

        {recipes.length ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
          <Disclosure title="Drag saved recipes (optional)">
          <Text style={[typography.small, { paddingHorizontal: spacing.lg, marginBottom: spacing.xs }]}>
            {recipes.length ? 'Press and hold a recipe, then drag it onto a meal' : 'Add recipes in the Recipes tab to plan with them'}
          </Text>
          <GHScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {recipes.map((r) => (
              <DraggableChip key={r.id} recipe={r} dragX={dragX} dragY={dragY} handlers={handlers} />
            ))}
          </GHScrollView>
          </Disclosure>
        </View> : null}
      </SafeAreaView>

      {dragging ? (
        <Animated.View pointerEvents="none" style={[styles.ghost, overlayStyle]}>
          <Text style={{ color: colors.onPrimary, fontWeight: '600' }} numberOfLines={1}>{dragging.title}</Text>
        </Animated.View>
      ) : null}

      <PlanRecipePicker visible={picker !== null} recipes={recipes} mealLabel={MEALS.find((m) => m.key === picker)?.label ?? 'meal'} onClose={() => setPicker(null)} onAdd={addChoice} />
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
