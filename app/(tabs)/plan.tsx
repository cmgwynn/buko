import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type View as RNView } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroBar } from '../../src/components/MacroBar';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Chip, ChipRow, Disclosure, Loading, Notice, TextField } from '../../src/components/ui';
import { PlanRecipePicker, type PlanChoice } from '../../src/components/PlanRecipePicker';
import { DateNavigator } from '../../src/components/date/DateNavigator';
import { DaySwipe } from '../../src/components/date/DaySwipe';
import { invalidateDateHistory } from '../../src/components/date/dateHistory';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { formatDay, MEALS } from '../../src/lib/diary';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import { STARTER_RECIPES, starterRecipeDraft } from '../../src/lib/recipes/library';
import { intakeMacros, MACRO_KEYS, type KnownMacros, type MealCandidate } from '../../src/lib/recipes/recommendations';
import { generateWeeklyMealPlan, mealPlanSnapshot, mealSlotKey, type WeeklyEntry } from '../../src/lib/recipes/weeklyPlan';
import { loadPlanningPreferences, savePlanningPreferences, type PlanningPreferences } from '../../src/lib/planning/preferences';
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

type RecipeRow = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'name' | 'grams' | 'nutrition'>[] };
type EntryRow = MealPlanEntry;
const weeklyEntries = (rows: EntryRow[]): WeeklyEntry[] => rows.map((row) => ({
  id: row.id, date: row.planned_on, meal: row.meal, recipeId: row.recipe_id, servings: row.servings, logged: !!row.logged_at,
}));

export default function Plan() {
  return <PremiumGate feature="Meal planning"><PlanContent /></PremiumGate>;
}
function PlanContent() {
  const router = useRouter();
  const confirm = useConfirm();
  const { session } = useAuth();
  const { targets, profile, today } = useProfile();
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
  const [generatorDays, setGeneratorDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [generatorMeals, setGeneratorMeals] = useState<Meal[]>(['breakfast', 'lunch', 'dinner']);
  const [replaceSlots, setReplaceSlots] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<{ owner: string; value: PlanningPreferences } | null>(null);
  const [exclusionText, setExclusionText] = useState('');
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preview, setPreview] = useState<{
    owner: string; signature: string; context: string; result: ReturnType<typeof generateWeeklyMealPlan>;
  } | null>(null);
  const [intake, setIntake] = useState<{ owner: string; date: string; macros: KnownMacros } | null>(null);
  const copies = useRef(new WeakMap<RecipeDraft, string>());
  const requestVersion = useRef(0);
  const mutation = useRef(false);
  const activeOwner = useRef(session?.user.id);
  activeOwner.current = session?.user.id;

  const start = mondayOfWeek(selected);
  const activePreferences = preferences && preferences.owner === session?.user.id ? preferences.value : null;

  const loadExclusions = useCallback(async () => {
    if (!session) return;
    try {
      const value = await loadPlanningPreferences(session.user.id);
      if (activeOwner.current !== session.user.id) return;
      setPreferences({ owner: session.user.id, value });
      setExclusionText(value.excludedFoods.join('\n'));
      setPreferenceError(null);
    } catch (err) {
      if (activeOwner.current !== session.user.id) return;
      setPreferences(null);
      setPreferenceError(err instanceof Error ? err.message : 'Could not load exclusions.');
    }
  }, [session?.user.id]);
  useFocusEffect(useCallback(() => { void loadExclusions(); }, [loadExclusions]));

  async function saveExclusions() {
    if (!session || savingPreferences) return;
    setSavingPreferences(true); setPreview(null);
    try {
      // Reload the other preference field rather than overwriting a stale exercise-exclusion snapshot.
      const latest = await loadPlanningPreferences(session.user.id);
      const value = await savePlanningPreferences(session.user.id, {
        ...latest, excludedFoods: exclusionText.split(/\n|,/).map((value) => value.trim()).filter(Boolean),
      });
      if (activeOwner.current !== session.user.id) return;
      setPreferences({ owner: session.user.id, value });
      setExclusionText(value.excludedFoods.join('\n')); setPreferenceError(null);
    } catch (err) { if (activeOwner.current === session.user.id) setPreferenceError(err instanceof Error ? err.message : 'Could not save food exclusions.'); }
    finally { setSavingPreferences(false); }
  }

  const load = useCallback(async () => {
    const request = ++requestVersion.current;
    setIntake(null);
    if (!session) { setRecipes([]); setEntries([]); return; }
    // Optional intake must never delay the normal manual Plan load.
    void supabase.from('food_log_entries').select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', session.user.id).eq('logged_on', today)
      .then((food) => {
        if (request === requestVersion.current && !food.error && food.data)
          setIntake({ owner: session.user.id, date: today, macros: intakeMacros(food.data) });
      }, () => {});
    try {
      const [r, e] = await Promise.all([
        supabase.from('recipes').select('*, recipe_ingredients(name, grams, nutrition)').eq('user_id', session.user.id).order('title'),
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
  }, [session?.user.id, start, today]);

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
  const libraryIdeas = useMemo(() => STARTER_RECIPES.map((recipe) => ({
    recipe, draft: starterRecipeDraft(recipe),
  })), []);
  const candidates = useMemo<MealCandidate[]>(() => [
    ...recipes.map((recipe) => ({
      id: recipe.id, title: recipe.title, source: 'saved' as const, servings: recipe.servings, ingredients: recipe.recipe_ingredients,
    })),
    ...libraryIdeas.map(({ recipe, draft }) => ({
      id: `library:${recipe.id}`, title: recipe.title, source: 'library' as const,
      servings: draft.servings, ingredients: draft.ingredients, meal: recipe.meal.toLowerCase() as Meal,
    })),
  ], [recipes, libraryIdeas]);
  const generatorContext = useMemo(() => JSON.stringify([start, generatorDays, generatorMeals, replaceSlots,
    activePreferences?.excludedFoods, exclusionText, profile?.diet_prefs, targets, intake, candidates]),
  [start, generatorDays, generatorMeals, replaceSlots, activePreferences?.excludedFoods, exclusionText,
    profile?.diet_prefs, targets, intake, candidates]);
  const liveGeneratorContext = useRef(generatorContext);
  liveGeneratorContext.current = generatorContext;
  useEffect(() => { setPreview(null); }, [generatorContext]);
  useEffect(() => { setReplaceSlots([]); setPreview(null); }, [start, session?.user.id]);
  useEffect(() => { setPreferences(null); setExclusionText(''); setPreferenceError(null); }, [session?.user.id]);

  function macroText(macros: KnownMacros) {
    return MACRO_KEYS.map((key) => `${key === 'calories' ? 'Calories' : key.replace('_g', '')}: ${macros[key] === null ? 'unknown' : `${Math.round(macros[key]!)} ${key === 'calories' ? 'kcal' : 'g'}`}`).join(' · ');
  }

  function generatePreview() {
    if (!session || !activePreferences || !profile || error) return;
    setPreview({
      owner: session.user.id, signature: mealPlanSnapshot(weeklyEntries(entries)), context: generatorContext,
      result: generateWeeklyMealPlan({
        weekStart: start, dates: generatorDays.map((index) => addDays(start, index)), meals: generatorMeals,
        replaceSlots, entries: weeklyEntries(entries), candidates, preferences: profile.diet_prefs,
        foodExclusions: activePreferences.excludedFoods, targets, today,
        intake: intake?.owner === session.user.id && intake.date === today ? intake.macros : null,
      }),
    });
  }

  async function applyPreview() {
    if (!session || !preview || mutation.current || preview.owner !== session.user.id || preview.context !== generatorContext) return;
    const proposal = preview;
    if (!await confirm({
      title: 'Add this weekly meal plan?',
      message: `${proposal.result.additions} meals will be added to the previewed dates. ${proposal.result.replaceIds.length} existing unlogged meals will be removed only from the slots you explicitly selected. All other meals and all diary logs remain unchanged. Library recipes save private copies. Nutrition is estimated; check ingredients and labels for allergies.`,
      confirmLabel: 'Confirm weekly meal plan',
    })) return;
    if (mutation.current || activeOwner.current !== proposal.owner || liveGeneratorContext.current !== proposal.context) {
      setPreview(null); setError('Planning inputs changed. Generate and review a fresh preview.');
      return;
    }
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    let inserted = false;
    let saveError: string | null = null;
    try {
      const [current, savedPreferences] = await Promise.all([
        supabase.from('meal_plan_entries').select('*').eq('user_id', session.user.id).gte('planned_on', start).lte('planned_on', addDays(start, 6)),
        loadPlanningPreferences(session.user.id),
      ]);
      if (current.error) throw new Error(current.error.message);
      if (mealPlanSnapshot(weeklyEntries(current.data as EntryRow[])) !== proposal.signature
        || JSON.stringify(savedPreferences.excludedFoods) !== JSON.stringify(activePreferences?.excludedFoods)) {
        setPreview(null); await load(); await loadExclusions();
        throw new Error('Your plan or saved food exclusions changed. Generate and review a fresh preview; nothing was added.');
      }
      const additions = proposal.result.slots.filter((slot) => slot.candidate !== null);
      const rows = [];
      for (const slot of additions) {
        const candidate = slot.candidate!;
        let id = candidate.id;
        if (candidate.source === 'library') {
          const library = libraryIdeas.find(({ recipe }) => `library:${recipe.id}` === candidate.id);
          if (!library) throw new Error('A previewed library recipe is no longer available.');
          id = copies.current.get(library.draft) ?? await saveRecipe(session.user.id, library.draft);
          copies.current.set(library.draft, id);
        }
        rows.push({ user_id: session.user.id, planned_on: slot.date, meal: slot.meal, recipe_id: id, servings: slot.servings });
      }
      if (!rows.length) return;
      const result = await supabase.from('meal_plan_entries').insert(rows);
      if (result.error) throw new Error(`Could not confirm the weekly plan was saved. Originals were not removed. Refresh Plan before retrying; any saved private recipe copies remain available. ${result.error.message}`);
      inserted = true;
      // Add first: a failed replacement must never destroy the user's original meals.
      for (const id of proposal.result.replaceIds) {
        const original = (current.data as EntryRow[]).find((row) => row.id === id)!;
        const removed = await supabase.from('meal_plan_entries').delete().eq('user_id', session.user.id)
          .eq('id', id).eq('recipe_id', original.recipe_id).eq('planned_on', original.planned_on)
          .eq('meal', original.meal).eq('servings', original.servings).is('logged_at', null).select('id');
        if (removed.error || !removed.data?.length) throw new Error('New meals were added, but at least one original meal could not be replaced or changed during saving. Review your plan: some originals remain. Do not retry the old preview.');
      }
      setMessage('Weekly meal plan added. Review servings or remove meals using your normal Plan controls.');
    } catch (err) { saveError = err instanceof Error ? err.message : 'Could not save weekly plan.'; }
    finally {
      setPreview(null); setReplaceSlots([]);
      if (inserted) await load();
      if (saveError) setError(saveError);
      mutation.current = false; setPending(false);
    }
  }

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
  async function addChoice(choice: PlanChoice, servings: number, meal: Meal | null = picker) {
    if (!session || !meal || mutation.current) return false;
    mutation.current = true; setPending(true); setError(null); setMessage(null);
    try {
      let id = choice.id;
      if (choice.draft) {
        id = copies.current.get(choice.draft);
        if (!id) { id = await saveRecipe(session.user.id, choice.draft); copies.current.set(choice.draft, id); }
      }
      const { error: e } = await supabase.from('meal_plan_entries').insert({ user_id: session.user.id, planned_on: selected, meal, recipe_id: id, servings });
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

          {loaded ? <Card>
            <Disclosure title="Generate a weekly meal plan">
              <Text style={typography.small}>Week of {formatDay(start)}. Choose days and meals, review the entire preview, then explicitly confirm. Manual Plan controls remain unchanged. No AI or external recipe/nutrition calls.</Text>
              <Text style={typography.label}>Days to generate</Text>
              <ChipRow>{Array.from({ length: 7 }, (_, index) => <Chip key={index} label={formatDay(addDays(start, index))} selected={generatorDays.includes(index)} disabled={pending}
                onPress={() => setGeneratorDays((days) => days.includes(index) ? days.filter((day) => day !== index) : [...days, index].sort())} />)}</ChipRow>
              <Text style={typography.label}>Meal slots</Text>
              <ChipRow>{MEALS.map(({ key, label }) => <Chip key={key} label={label} selected={generatorMeals.includes(key)} disabled={pending}
                onPress={() => setGeneratorMeals((meals) => meals.includes(key) ? meals.filter((meal) => meal !== key) : [...meals, key])} />)}</ChipRow>
              <TextField label="Saved food exclusions (one food per line or comma)" value={exclusionText} onChangeText={setExclusionText} multiline editable={!pending && !savingPreferences} />
              <Text style={typography.small}>Saved to this account and applied to recipe titles and every ingredient. Phrase matching is conservative, not allergy certification. Save edits before generating.</Text>
              {preferenceError ? <Notice tone="danger">{preferenceError}</Notice> : null}
              {!activePreferences ? <Button title="Load saved exclusions" variant="secondary" disabled={pending} onPress={() => { void loadExclusions(); }} /> : null}
              <Button title="Save food exclusions" variant="secondary" loading={savingPreferences} disabled={pending || !activePreferences} onPress={() => { void saveExclusions(); }} />
              <Text style={typography.label}>Occupied slots: select only those you want replaced</Text>
              {generatorDays.flatMap((index) => generatorMeals.map((meal) => {
                const date = addDays(start, index);
                const occupied = entries.filter((entry) => entry.planned_on === date && entry.meal === meal);
                if (!occupied.length) return null;
                const key = mealSlotKey(date, meal);
                const protectedSlot = occupied.some((entry) => entry.logged_at);
                return <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: replaceSlots.includes(key), disabled: pending || protectedSlot }}
                  disabled={pending || protectedSlot} style={{ paddingVertical: spacing.sm, minHeight: 44 }}
                  onPress={() => setReplaceSlots((slots) => slots.includes(key) ? slots.filter((slot) => slot !== key) : [...slots, key])}>
                  <Text style={typography.body}>{replaceSlots.includes(key) && !protectedSlot ? '☑' : '☐'} {formatDay(date)} · {meal} {protectedSlot ? '(logged: preserved)' : '(preserved unless checked)'}</Text>
                  <Text style={typography.small}>{occupied.map((entry) => `${recipeById.get(entry.recipe_id)?.title ?? 'Unavailable recipe'} (${entry.servings} servings)`).join(' · ')}</Text>
                </Pressable>;
              }))}
              <Text style={typography.small}>Goal data: {targets ? macroText(targets) : 'unavailable; no goal-fit claims'}. Preferences: {profile?.diet_prefs.join(', ') || (profile ? 'none' : 'unavailable')}.</Text>
              <Text style={typography.small}>{intake && intake.owner === session?.user.id && intake.date === today ? 'Uses logged intake only for today; logged plan rows are not counted twice.' : 'Today’s intake unavailable: uses planned meals only, not an assumed zero intake.'} Future/past days use their own plans, never today’s intake. Fixed meal shares (25/30/35/10%) guide remaining budgets; variety is preferred among equally complete recipes. No guarantee of meeting daily targets; 1 serving per generated meal, editable afterward.</Text>
              <Notice tone="info">All nutrient values are estimates. Missing nutrients remain unknown, not zero. Starter-library recipes are not guaranteed kitchen-tested. Recognizable diet conflicts and saved exclusions are filtered, but recipes are never certified compatible or allergy-safe. Review ingredients, product labels and cross-contact risks before use.</Notice>
              <Button title="Preview weekly meal plan" disabled={pending || savingPreferences || !activePreferences || !profile || !!error || !generatorDays.length || !generatorMeals.length || exclusionText !== activePreferences.excludedFoods.join('\n')}
                onPress={generatePreview} />
              {preview ? <>
                <Text accessibilityRole="header" style={typography.subheading}>Full weekly preview · {preview.result.additions} additions · {preview.result.replaceIds.length} removals</Text>
                <Text style={typography.small}>All unselected days/meals and all unchecked occupied slots remain unchanged. Only the replacements listed below are removed after additions succeed.</Text>
                {preview.result.slots.map((slot) => <View key={mealSlotKey(slot.date, slot.meal)} style={{ marginTop: spacing.md }}>
                  <Text style={typography.subheading}>{formatDay(slot.date)} · {slot.meal}</Text>
                  <Text style={typography.body}>{slot.candidate ? `${slot.replaceIds.length ? 'REPLACE' : 'ADD'}: ${slot.candidate.title} · 1 serving · ${slot.candidate.source}` : 'NO CHANGE'}</Text>
                  {slot.replaceIds.length ? <Text style={typography.small}>Remove: {slot.replaceIds.map((id) => {
                    const entry = entries.find((entry) => entry.id === id);
                    return entry ? recipeById.get(entry.recipe_id)?.title ?? 'Unavailable recipe' : id;
                  }).join(', ')}</Text> : null}
                  {slot.macros ? <Text style={typography.small}>Estimates: {macroText(slot.macros)}</Text> : null}
                  {slot.candidate ? <Text style={typography.small}>Ingredients: {slot.candidate.ingredients.map((ingredient) => ingredient.name).join(', ')}</Text> : null}
                  <Text style={typography.small}>{slot.reason}</Text>
                </View>)}
                {preview.result.dailyTotals.map(({ date, totals }) => <Text key={date} style={[typography.small, { marginTop: spacing.sm }]}>{formatDay(date)} final planned totals (estimates, not intake): {macroText(totals)}</Text>)}
                <Button title="Confirm and add previewed weekly plan" disabled={pending || savingPreferences || !preview.result.additions} onPress={() => { void applyPreview(); }} />
                <Button title="Discard preview" variant="ghost" disabled={pending} onPress={() => setPreview(null)} />
              </> : null}
            </Disclosure>
          </Card> : null}

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
