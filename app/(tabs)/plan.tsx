import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type View as RNView } from 'react-native';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MacroBar } from '../../src/components/MacroBar';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Chip, ChipRow, Disclosure, Eyebrow, HeroCta, Loading, Notice, Step, TextField } from '../../src/components/ui';
import { config } from '../../src/lib/config';
import { PlanRecipePicker, type PlanChoice } from '../../src/components/PlanRecipePicker';
import { DateNavigator } from '../../src/components/date/DateNavigator';
import { DaySwipe } from '../../src/components/date/DaySwipe';
import { invalidateDateHistory } from '../../src/components/date/dateHistory';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { formatDay, MEALS } from '../../src/lib/diary';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import { STARTER_RECIPES, starterRecipeDraft } from '../../src/lib/recipes/library';
import { intakeMacros, MACRO_KEYS, type KnownMacros, type MealCandidate } from '../../src/lib/recipes/recommendations';
import { generateWeeklyMealPlan, MEAL_PLAN_STYLES, mealPlanSnapshot, mealSlotKey, type MealPlanStyle, type WeeklyEntry } from '../../src/lib/recipes/weeklyPlan';
import { loadPlanningPreferences, savePlanningPreferences, type PlanningPreferences } from '../../src/lib/planning/preferences';
import { fuelLabel, fuelWeek } from '../../src/lib/planning/fueling';
import { loadPlannedWorkouts, type PlannedWorkoutRow } from '../../src/lib/fitness/data';
import type { MealPlanEntry, Recipe, RecipeIngredient } from '../../src/lib/recipes/types';
import { mondayOfWeek } from '../../src/lib/dates';
import { addDays } from '../../src/lib/diary';
import { logPlanEntry } from '../../src/lib/recipes/logging';
import { saveRecipe } from '../../src/lib/recipes/db';
import { repeatPlanRows } from '../../src/lib/recipes/repeat';
import type { RecipeDraft } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useBilling } from '../../src/providers/BillingProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSelectedDate } from '../../src/providers/SelectedDateProvider';
import { colors, layout, radius, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';

type RecipeRow = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'name' | 'grams' | 'nutrition'>[] };
type EntryRow = MealPlanEntry;
const weeklyEntries = (rows: EntryRow[]): WeeklyEntry[] => rows.map((row) => ({
  id: row.id, date: row.planned_on, meal: row.meal, recipeId: row.recipe_id, servings: row.servings, logged: !!row.logged_at,
}));

const MEAL_PRESETS: { label: string; meals: Meal[] }[] = [
  { label: '3 meals', meals: ['breakfast', 'lunch', 'dinner'] },
  { label: '3 meals + snack', meals: ['breakfast', 'lunch', 'dinner', 'snack'] },
  { label: '2 meals', meals: ['lunch', 'dinner'] },
];

export default function Plan() {
  const router = useRouter();
  const confirm = useConfirm();
  const { session } = useAuth();
  const billing = useBilling();
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
  const [shopWeek, setShopWeek] = useState<string | null>(null);
  const [removed, setRemoved] = useState<EntryRow | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [swappedOut, setSwappedOut] = useState<Record<string, string[]>>({});
  const { generate: generateParam } = useLocalSearchParams<{ generate?: string }>();
  useEffect(() => {
    // Other screens deep-link here with ?generate=1 to open the weekly generator.
    if (generateParam) { setGeneratorOpen(true); router.setParams({ generate: undefined }); }
  }, [generateParam]);
  const [generateQueued, setGenerateQueued] = useState(false);
  const [generatorDays, setGeneratorDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [generatorMeals, setGeneratorMeals] = useState<Meal[]>(['breakfast', 'lunch', 'dinner']);
  const [mealStyle, setMealStyle] = useState<MealPlanStyle>('balanced');
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
  const [training, setTraining] = useState<{ key: string; rows: PlannedWorkoutRow[] } | null>(null);
  const [fuelOn, setFuelOn] = useState(true);
  const trainingKey = `${session?.user.id ?? ''}:${start}`;
  useFocusEffect(useCallback(() => {
    if (!session) return;
    let live = true;
    const key = `${session.user.id}:${start}`;
    // Training is optional context for fueling; failures just mean no training-day adjustments.
    loadPlannedWorkouts(start, addDays(start, 6))
      .then((rows) => { if (live) setTraining({ key, rows }); })
      .catch(() => { if (live) setTraining({ key, rows: [] }); });
    return () => { live = false; };
  }, [session?.user.id, start]));
  const fuelDays = useMemo(() => {
    if (!targets || !profile || training?.key !== trainingKey) return null;
    const base = { calories: targets.calories, protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g };
    return fuelWeek(Array.from({ length: 7 }, (_, index) => addDays(start, index)), training.rows, base, profile.weight_kg);
  }, [targets, profile?.weight_kg, training, trainingKey, start]);
  const trainingDays = fuelDays?.filter((day) => day.kind !== 'rest').length ?? 0;
  const fuelFor = (date: string) => fuelOn && trainingDays ? fuelDays?.find((day) => day.date === date) ?? null : null;
  const dailyTargets = useMemo(() => fuelOn && fuelDays
    ? Object.fromEntries(fuelDays.filter((day) => day.shiftKcal).map((day) => [day.date, day.targets])) : undefined, [fuelOn, fuelDays]);

  async function saveExclusions(): Promise<boolean> {
    if (!session || savingPreferences) return false;
    setSavingPreferences(true); setPreview(null);
    try {
      // Reload the other preference field rather than overwriting a stale exercise-exclusion snapshot.
      const latest = await loadPlanningPreferences(session.user.id);
      const value = await savePlanningPreferences(session.user.id, {
        ...latest, excludedFoods: exclusionText.split(/\n|,/).map((value) => value.trim()).filter(Boolean),
      });
      if (activeOwner.current !== session.user.id) return false;
      setPreferences({ owner: session.user.id, value });
      setExclusionText(value.excludedFoods.join('\n')); setPreferenceError(null);
      return true;
    } catch (err) { if (activeOwner.current === session.user.id) setPreferenceError(err instanceof Error ? err.message : 'Could not save foods to skip.'); return false; }
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
  const generatorContext = useMemo(() => JSON.stringify([start, generatorDays, generatorMeals, mealStyle, replaceSlots,
    activePreferences?.excludedFoods, exclusionText, profile?.diet_prefs, targets, dailyTargets, intake, candidates]),
  [start, generatorDays, generatorMeals, mealStyle, replaceSlots, activePreferences?.excludedFoods, exclusionText,
    profile?.diet_prefs, targets, dailyTargets, intake, candidates]);
  const liveGeneratorContext = useRef(generatorContext);
  liveGeneratorContext.current = generatorContext;
  useEffect(() => { setPreview(null); setSwappedOut({}); }, [generatorContext]);
  useEffect(() => { setReplaceSlots([]); setPreview(null); }, [start, session?.user.id]);
  useEffect(() => {
    // Default to the remaining days of the week; past days are opt-in.
    const upcoming = Array.from({ length: 7 }, (_, index) => index).filter((index) => addDays(start, index) >= today);
    setGeneratorDays(upcoming.length ? upcoming : [0, 1, 2, 3, 4, 5, 6]);
  }, [start, today]);
  useEffect(() => { setPreferences(null); setExclusionText(''); setPreferenceError(null); }, [session?.user.id]);

  function macroText(macros: KnownMacros) {
    return MACRO_KEYS.map((key) => `${key === 'calories' ? 'Calories' : key.replace('_g', '')}: ${macros[key] === null ? 'unknown' : `${Math.round(macros[key]!)} ${key === 'calories' ? 'kcal' : 'g'}`}`).join(' · ');
  }

  function generatePreview(swaps: Record<string, string[]> = swappedOut, pinned?: Record<string, string>) {
    if (!session || !activePreferences || !profile || error) return;
    setPreview({
      owner: session.user.id, signature: mealPlanSnapshot(weeklyEntries(entries)), context: generatorContext,
      result: generateWeeklyMealPlan({
        weekStart: start, dates: generatorDays.map((index) => addDays(start, index)), meals: generatorMeals,
        replaceSlots, entries: weeklyEntries(entries), candidates, preferences: profile.diet_prefs,
        foodExclusions: activePreferences.excludedFoods, targets, dailyTargets, today,
        intake: intake?.owner === session.user.id && intake.date === today ? intake.macros : null,
        swappedOut: swaps, style: mealStyle, pinned,
      }),
    });
  }

  function swapSlot(date: string, meal: Meal, recipeId: string) {
    const key = mealSlotKey(date, meal);
    const next = { ...swappedOut, [key]: [...(swappedOut[key] ?? []), recipeId] };
    setSwappedOut(next);
    // Keep every other previewed meal exactly as it was.
    const pinned = Object.fromEntries((preview?.result.slots ?? [])
      .filter((slot) => slot.candidate && mealSlotKey(slot.date, slot.meal) !== key)
      .map((slot) => [mealSlotKey(slot.date, slot.meal), slot.candidate!.id]));
    generatePreview(next, pinned);
  }

  async function previewWeek() {
    if (!activePreferences) return;
    setSwappedOut({});
    if (exclusionText === activePreferences.excludedFoods.join('\n')) { generatePreview({}); return; }
    // Saved exclusions update state asynchronously; generate once the saved list matches the field.
    if (await saveExclusions()) setGenerateQueued(true);
  }
  useEffect(() => {
    if (!generateQueued || !activePreferences || exclusionText !== activePreferences.excludedFoods.join('\n')) return;
    setGenerateQueued(false);
    generatePreview({});
  });

  async function applyPreview() {
    if (!session || !preview || mutation.current || preview.owner !== session.user.id || preview.context !== generatorContext) return;
    if (!billing.allowed) { router.push({ pathname: '/premium', params: { from: 'meal-plan' } }); return; }
    const proposal = preview;
    if (!await confirm({
      title: 'Add this weekly meal plan?',
      message: `Adds ${proposal.result.additions} meals${proposal.result.replaceIds.length ? ` and replaces ${proposal.result.replaceIds.length} you selected` : ''}. Everything else, including diary logs, stays as is. Nutrition is estimated; check labels for allergies.`,
      confirmLabel: 'Add to my plan',
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
      setMessage('Your week is planned. Adjust servings or swap meals any time.'); setShopWeek(start); setGeneratorOpen(false);
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
          {shopWeek === start && !pending ? (
            <Card>
              <Text style={typography.heading}>Shop for this week</Text>
              <Text style={[typography.small, { marginBottom: spacing.sm }]}>Turn these meals into one grocery list{config.groceryOrdering ? ', then order on Instacart' : ''}. Pantry items are skipped.</Text>
              <Button title="Build my grocery list" icon="cart-outline" onPress={() => { setShopWeek(null); router.push({ pathname: '/grocery/generate', params: { week: start, from: 'plan' } }); }} />
            </Card>
          ) : null}
          {removed ? <Button title="Undo remove meal" variant="ghost" disabled={pending} onPress={() => { void undoRemove(); }} /> : null}
          {!loaded ? <Loading /> : null}
          {loaded && !generatorOpen ? <HeroCta eyebrow={`Week of ${formatDay(start)}`} title="Plan my week"
            body="Recipes that fit your targets. You review before anything is added."
            action="Generate my week" icon="sparkles-outline"
            onPress={() => setGeneratorOpen(true)} /> : null}
          {loaded && generatorOpen ? <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Eyebrow>{`Week of ${formatDay(start)}`}</Eyebrow>
                <Text accessibilityRole="header" style={typography.heading}>Plan my week</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close meal plan generator" hitSlop={8}
                onPress={() => setGeneratorOpen(false)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <Step n={1}>Plan style</Step>
            <ChipRow>{MEAL_PLAN_STYLES.map((item) => <Chip key={item.key} label={item.label} selected={mealStyle === item.key} disabled={pending}
              onPress={() => setMealStyle(item.key)} />)}</ChipRow>
            <Text style={typography.small}>{MEAL_PLAN_STYLES.find((item) => item.key === mealStyle)!.hint}</Text>
            <Step n={2}>Days</Step>
            <ChipRow>{Array.from({ length: 7 }, (_, index) => <Chip key={index} label={formatDay(addDays(start, index))} selected={generatorDays.includes(index)} disabled={pending}
              onPress={() => setGeneratorDays((days) => days.includes(index) ? days.filter((day) => day !== index) : [...days, index].sort())} />)}</ChipRow>
            <Step n={3}>Meals</Step>
            <ChipRow>{MEAL_PRESETS.map((preset) => <Chip key={preset.label} label={preset.label} disabled={pending}
              selected={preset.meals.length === generatorMeals.length && preset.meals.every((meal) => generatorMeals.includes(meal))}
              onPress={() => setGeneratorMeals(preset.meals)} />)}</ChipRow>
            <ChipRow>{MEALS.map(({ key, label }) => <Chip key={key} label={label} selected={generatorMeals.includes(key)} disabled={pending}
              onPress={() => setGeneratorMeals((meals) => meals.includes(key) ? meals.filter((meal) => meal !== key) : [...meals, key])} />)}</ChipRow>
            <Step n={4}>Foods to skip</Step>
            <TextField label="Foods to skip (comma or new line)" value={exclusionText} onChangeText={setExclusionText} multiline editable={!pending && !savingPreferences} />
            <Text style={typography.small}>Saved for next time. Not an allergy guarantee.</Text>
            {preferenceError ? <Notice tone="danger">{preferenceError}</Notice> : null}
            <Step n={5}>Training</Step>
            {trainingDays ? <>
              <ChipRow><Chip label={`Fuel my ${trainingDays} training day${trainingDays === 1 ? '' : 's'}`} selected={fuelOn} disabled={pending} onPress={() => setFuelOn((on) => !on)} /></ChipRow>
              <Text style={typography.small}>More carbs on workout days, same weekly calories.</Text>
            </> : <>
              <Text style={typography.small}>No workouts this week. Add a plan to fuel workout days.</Text>
              <Button title="Build a training plan" icon="barbell-outline" variant="ghost" onPress={() => router.push('/workout/plan')} />
            </>}
            {!activePreferences ? <Button title="Load saved foods to skip" variant="secondary" disabled={pending} onPress={() => { void loadExclusions(); }} /> : null}
            {(() => {
              const occupied = generatorDays.flatMap((index) => generatorMeals.map((meal) => {
                const date = addDays(start, index);
                const rows = entries.filter((entry) => entry.planned_on === date && entry.meal === meal);
                return rows.length ? { date, meal, rows } : null;
              })).filter((slot): slot is NonNullable<typeof slot> => slot !== null);
              if (!occupied.length) return null;
              return <Disclosure title={`Replace already-planned meals (${occupied.length})`}>
                <Text style={typography.small}>Planned meals are kept unless you tick them here. Logged meals are never replaced.</Text>
                {occupied.map(({ date, meal, rows }) => {
                  const key = mealSlotKey(date, meal);
                  const protectedSlot = rows.some((entry) => entry.logged_at);
                  return <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: replaceSlots.includes(key), disabled: pending || protectedSlot }}
                    disabled={pending || protectedSlot} style={{ paddingVertical: spacing.sm, minHeight: 44 }}
                    onPress={() => setReplaceSlots((slots) => slots.includes(key) ? slots.filter((slot) => slot !== key) : [...slots, key])}>
                    <Text style={typography.body}>{replaceSlots.includes(key) && !protectedSlot ? '☑' : '☐'} {formatDay(date)} · {MEALS.find((item) => item.key === meal)?.label ?? meal}{protectedSlot ? ' (logged)' : ''}</Text>
                    <Text style={typography.small}>{rows.map((entry) => recipeById.get(entry.recipe_id)?.title ?? 'Unavailable recipe').join(' · ')}</Text>
                  </Pressable>;
                })}
              </Disclosure>;
            })()}
            <Disclosure title="How this works">
              <Text style={typography.small}>Targets: {targets ? macroText(targets) : 'unavailable, so no goal-fit claims'}. Diet preferences: {profile?.diet_prefs.join(', ') || (profile ? 'none' : 'unavailable')}.</Text>
              <Text style={typography.small}>{intake && intake.owner === session?.user.id && intake.date === today ? 'Today counts what you’ve already logged.' : 'Today’s intake is unavailable, so only planned meals are counted.'} Other days use their own plans. Each meal gets a share of your day (25/30/35/10%), favoring variety. One serving per meal, editable afterwards. No AI or outside calls.</Text>
              <Notice tone="info">Nutrition values are estimates; missing nutrients stay unknown. Starter recipes aren’t kitchen-tested. Recipes are filtered, never certified allergy-safe. Check ingredients and labels.</Notice>
            </Disclosure>
            <Button title="Preview my week" icon="sparkles-outline" loading={savingPreferences}
              disabled={pending || savingPreferences || !activePreferences || !profile || !!error || !generatorDays.length || !generatorMeals.length}
              onPress={() => { void previewWeek(); }} />
            {preview ? <>
              <Text accessibilityRole="header" style={[typography.subheading, { marginTop: spacing.md }]}>
                Your week · {preview.result.additions} meal{preview.result.additions === 1 ? '' : 's'}{preview.result.replaceIds.length ? ` · ${preview.result.replaceIds.length} replaced` : ''}
              </Text>
              <Text style={typography.small}>Not feeling one? Tap ⇄ to swap just that meal.</Text>
              {preview.result.dailyTotals.map(({ date, totals }) => {
                const slots = preview.result.slots.filter((slot) => slot.date === date);
                return <View key={date} style={{ marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Eyebrow>{formatDay(date)}</Eyebrow>
                    <Text style={typography.small}>{totals.calories == null ? 'kcal unknown' : `~${Math.round(totals.calories).toLocaleString()} kcal`}</Text>
                  </View>
                  {(() => {
                    const fuel = fuelFor(date);
                    return fuel && fuel.kind !== 'rest' ? <Text style={[typography.label, { color: colors.primary }]}>{fuelLabel(fuel)}</Text> : null;
                  })()}
                  {slots.map((slot) => {
                    const label = MEALS.find((item) => item.key === slot.meal)?.label ?? slot.meal;
                    const removedTitles = slot.replaceIds.map((id) => {
                      const entry = entries.find((row) => row.id === id);
                      return entry ? recipeById.get(entry.recipe_id)?.title ?? 'Unavailable recipe' : id;
                    });
                    return <View key={mealSlotKey(slot.date, slot.meal)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 }}>
                      <Text style={[typography.small, { width: 72 }]}>{label}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={slot.candidate ? typography.body : typography.small} numberOfLines={2}>
                          {slot.candidate ? slot.candidate.title : slot.reason.startsWith('Preserved') ? 'Keeping what’s planned' : 'No matching recipe'}
                        </Text>
                        {removedTitles.length ? <Text style={typography.small}>Replaces {removedTitles.join(', ')}</Text> : null}
                      </View>
                      {slot.macros?.calories != null ? <Text style={typography.small}>{Math.round(slot.macros.calories)} kcal</Text> : null}
                      {slot.candidate ? <Pressable accessibilityRole="button" accessibilityLabel={`Swap ${label} on ${formatDay(slot.date)}`} disabled={pending}
                        onPress={() => swapSlot(slot.date, slot.meal, slot.candidate!.id)} hitSlop={8}
                        style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="shuffle" size={18} color={colors.primary} />
                      </Pressable> : null}
                    </View>;
                  })}
                  <Disclosure title="Ingredients & macros">
                    {slots.filter((slot) => slot.candidate).map((slot) => <Text key={mealSlotKey(slot.date, slot.meal)} style={[typography.small, { marginBottom: spacing.xs }]}>
                      {slot.candidate!.title}: {slot.candidate!.ingredients.map((ingredient) => ingredient.name).join(', ')}{slot.macros ? ` — ${macroText(slot.macros)}` : ''}
                    </Text>)}
                    <Text style={typography.small}>Day total (estimate): {macroText(totals)}</Text>
                  </Disclosure>
                </View>;
              })}
              {!billing.allowed ? <Text style={typography.small}>Previews are free. Saving generated plans is part of Buko Plus, with a free trial.</Text> : null}
              <Button title={billing.allowed ? 'Add to my plan' : 'Save with Buko Plus'} icon={billing.allowed ? 'checkmark' : 'lock-closed-outline'} disabled={pending || savingPreferences || !preview.result.additions} onPress={() => { void applyPreview(); }} />
              <Button title="Discard preview" variant="ghost" disabled={pending} onPress={() => setPreview(null)} />
            </> : null}
          </Card> : null}

          {targets ? (() => {
            const fuel = fuelFor(selected);
            const dayTarget = fuel?.targets ?? targets;
            return <Card>
              <Text style={typography.label}>Planned {formatDay(selected)}{fuel && (fuel.kind !== 'rest' || fuel.shiftKcal) ? ` · ${fuelLabel(fuel)}` : ''}</Text>
              <Text style={[typography.body, { marginVertical: spacing.sm }]}>
                {totals.calories === 0
                  ? 'Nothing planned yet.'
                  : `${Math.round(totals.calories).toLocaleString()} kcal · Target ${dayTarget.calories.toLocaleString()} kcal`}
              </Text>
              {entries.some((e) => e.planned_on === selected && !perServing.get(e.recipe_id)?.complete) ? <Text style={typography.small}>Partial estimate: meals with incomplete nutrition are excluded.</Text> : null}
              <Disclosure title="Macro breakdown">
              <MacroBar label="Calories" unit="kcal" value={totals.calories} target={dayTarget.calories} color={colors.macro.calories} />
              <MacroBar label="Protein" value={totals.protein} target={dayTarget.protein_g} color={colors.macro.protein} />
              <MacroBar label="Carbs" value={totals.carbs} target={dayTarget.carbs_g} color={colors.macro.carbs} />
              <MacroBar label="Fat" value={totals.fat} target={dayTarget.fat_g} color={colors.macro.fat} />
              </Disclosure>
            </Card>;
          })() : null}


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
