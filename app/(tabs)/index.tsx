import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MacroBar } from '../../src/components/MacroBar';
import { CoachDiaryPanel } from '../../src/components/CoachDiaryPanel';
import { useWelcome, WelcomeCard } from '../../src/components/WelcomeCard';
import { CheckinCard, useCheckinPrompt } from '../../src/components/CheckinCard';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, CardGrid, Eyebrow, HeroCard, Notice, Screen } from '../../src/components/ui';
import { addDays, defaultMeal, formatDay, MEALS, toDateString } from '../../src/lib/diary';
import { planMealCopy, restoreEntryRow, sumEntries } from '../../src/lib/foodLogging';
import { activityAdjustedTargets } from '../../src/lib/fitness/calc';
import { applyAdaptiveCalorieAdjustment } from '../../src/lib/nutrition/targets';
import { MICRONUTRIENTS, sumMicronutrients } from '../../src/lib/nutrition/micronutrients';
import { loadBurnedForDay } from '../../src/lib/fitness/data';
import { loadActivityForDay, maybeWriteNutrition, removeNutritionFromHealth, syncIfDue, type HealthRemoval } from '../../src/lib/health';
import { logPlanEntry, type RecipeWithNutrition } from '../../src/lib/recipes/logging';
import { computeRecipeNutrition, recipeNutritionMessage } from '../../src/lib/recipes/nutrition';
import type { MealPlanEntry } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { useSettings } from '../../src/providers/SettingsProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { FoodLogEntry, Meal } from '../../src/types';
import { randomUUID } from 'expo-crypto';
import { diaryRpc, mirrorDiaryTransfer } from '../../src/lib/diaryActionsClient';
import type { DiaryTransferResult } from '../../src/lib/diaryActions';
import { useSelectedDate } from '../../src/providers/SelectedDateProvider';
import { isDateString } from '../../src/lib/dates';
import { DateNavigator } from '../../src/components/date/DateNavigator';
import { DaySwipe } from '../../src/components/date/DaySwipe';
import { DiaryHistorySearch } from '../../src/components/diary/DiaryHistorySearch';
import { EntryActionsSheet } from '../../src/components/diary/EntryActionsSheet';
import { DiaryTransferSheet, type TransferSelection } from '../../src/components/diary/DiaryTransferSheet';
import { invalidateDateHistory } from '../../src/components/date/dateHistory';

type IconName = ComponentProps<typeof Ionicons>['name'];
const mealLabel = (m: Meal) => MEALS.find((x) => x.key === m)!.label;

/** Four ways to add to a meal: Search, Scan, Recipes, Recent. */
function AddOptions({ onPick }: { onPick(target: 'search' | 'scan' | 'recipes' | 'recent'): void }) {
  const items: { key: 'search' | 'scan' | 'recipes' | 'recent'; label: string; icon: IconName }[] = [
    { key: 'search', label: 'Search', icon: 'search' },
    { key: 'scan', label: 'Scan', icon: 'barcode-outline' },
    { key: 'recipes', label: 'Recipes', icon: 'book-outline' },
    { key: 'recent', label: 'Recent', icon: 'time-outline' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
      {items.map((i) => (
        <Pressable
          key={i.key}
          onPress={() => onPick(i.key)}
          accessibilityRole="button"
          accessibilityLabel={i.label}
          style={({ pressed }) => ({ flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primarySoft, opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name={i.icon} size={22} color={colors.primary} />
          <Text style={[typography.small, { color: colors.primary, fontWeight: '600', marginTop: 2 }]}>{i.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Diary() {
  const router = useRouter();
  const confirm = useConfirm();
  const params = useLocalSearchParams<{ date?: string }>();
  const { targets: baseTargets, profile, age, birthdayError } = useProfile();
  const { selectedDate: date, setSelectedDate: setDate, today } = useSelectedDate();
  const { settings } = useSettings();
  const [burned, setBurned] = useState(0);
  const { session } = useAuth();
  const [loadedPlans, setPlanned] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithNutrition[]>([]);
  const [loadedEntries, setEntries] = useState<FoodLogEntry[]>([]);
  const entries = loadedEntries.filter((entry) => entry.logged_on === date && entry.user_id === session?.user.id);
  const planned = loadedPlans.filter((entry) => entry.planned_on === date && entry.user_id === session?.user.id);
  const [error, setError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [addFor, setAddFor] = useState<Meal | 'top' | null>(null);
  const [topMeal, setTopMeal] = useState<Meal>(defaultMeal());
  const [copying, setCopying] = useState<Meal | null>(null);
  const [menuFor, setMenuFor] = useState<Meal | null>(null);
  const [undo, setUndo] = useState<{ entry: FoodLogEntry; removal: Promise<HealthRemoval> } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [actionEntry, setActionEntry] = useState<FoodLogEntry | null>(null);
  const [transfer, setTransfer] = useState<TransferSelection | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const welcome = useWelcome(session?.user.id);
  const checkin = useCheckinPrompt(session?.user.id, today);
  const [plansLoadedFor, setPlansLoadedFor] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const viewKey = `${session?.user.id ?? ''}:${date}`;
  const activeView = useRef(viewKey);
  activeView.current = viewKey;

  useEffect(() => {
    if (!params.date) return;
    if (isDateString(params.date)) { setDate(params.date); setRouteError(null); }
    else setRouteError('The requested diary date is invalid. Your selected day was kept.');
    router.setParams({ date: undefined });
  }, [params.date, router, setDate]);

  useEffect(() => {
    setActionError(null);
    setNotice(null);
    setAddFor(null);
    setMenuFor(null);
    setUndo(null);
    setActionEntry(null);
  }, [date]);

  const load = useCallback(async () => {
    if (activeView.current !== viewKey || !session) return;
    const version = ++loadVersion.current;
    setEntries([]); setPlanned([]); setBurned(0);
    const [log, plan, rec] = await Promise.all([
      supabase.from('food_log_entries').select('*').eq('logged_on', date).order('created_at'),
      supabase.from('meal_plan_entries').select('*').eq('planned_on', date).is('logged_at', null).order('created_at'),
      supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)'),
    ]);
    if (version !== loadVersion.current || activeView.current !== viewKey) return;
    if (log.error) setError(`Could not load your diary: ${log.error.message}`);
    else {
      setError(null);
      setEntries(log.data as FoodLogEntry[]);
    }
    if (settings?.activity_adjust) {
      // Prefer the health app's active-energy total for the day; otherwise count workouts logged in Buko.
      const act = await loadActivityForDay(date);
      const energy = act?.active_kcal != null ? Number(act.active_kcal) : await loadBurnedForDay(date);
      if (version !== loadVersion.current || activeView.current !== viewKey) return;
      setBurned(energy);
    } else {
      setBurned(0);
    }
    if (!plan.error && !rec.error) {
      setPlanned(plan.data as MealPlanEntry[]);
      setRecipes(rec.data as RecipeWithNutrition[]);
      setPlansLoadedFor(viewKey);
    } else setError(`Could not load your planned meals: ${plan.error?.message ?? rec.error?.message}`);
  }, [date, settings?.activity_adjust, session, viewKey]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (session && settings) {
        syncIfDue(session.user.id, settings).then((did) => {
          if (did) load();
        });
      }
      return () => { loadVersion.current++; };
    }, [load, session, settings]),
  );

  const totals = sumEntries(entries);
  const micronutrientTotals = sumMicronutrients(entries);
  const adjusted =
    settings?.activity_adjust && profile && baseTargets && age !== null
      ? activityAdjustedTargets(
          { goal: profile.goal, sex: profile.sex, age, heightCm: profile.height_cm, weightKg: profile.weight_kg, activityLevel: profile.activity_level },
          burned,
          settings.activity_share,
        )
      : null;
  const targets = adjusted && baseTargets && profile
    ? applyAdaptiveCalorieAdjustment({
        ...baseTargets,
        calories: adjusted.calories,
        protein_g: adjusted.protein_g,
        carbs_g: adjusted.carbs_g,
        fat_g: adjusted.fat_g,
        floor_applied: adjusted.floorApplied,
        adaptive_calorie_adjustment: 0,
      }, baseTargets.adaptive_calorie_adjustment ?? 0, profile.sex)
    : baseTargets;
  const remaining = targets ? targets.calories - totals.calories : 0;

  async function confirmDelete(entry: FoodLogEntry) {
    const ok = await confirm({ title: 'Remove entry?', message: `${entry.name} will be removed from ${formatDay(date)}.`, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    const { error: e } = await supabase.from('food_log_entries').delete().eq('id', entry.id);
    if (e) {
      setActionError(`Could not remove ${entry.name}: ${e.message}`);
      return;
    }
    setActionError(null);
    setNotice(null);
    const removal = removeNutritionFromHealth(entry.health_external_id ?? null);
    setUndo({ entry, removal });
    invalidateDateHistory();
    load();
    if (await removal === 'failed') setNotice(`${entry.name} was removed from Buko, but its copy in your health app couldn't be removed. Delete it there if needed.`);
  }

  async function undoRemove() {
    if (!session || !undo || restoring) return;
    const row = restoreEntryRow(undo.entry, session.user.id);
    if (!row) {
      setUndo(null);
      setActionError('This entry belongs to another account and was not restored.');
      return;
    }
    setRestoring(true);
    // Wait for the health-app removal so we know whether its old sample still exists.
    const removal = await undo.removal;
    const keepLink = removal === 'failed' ? undo.entry.health_external_id ?? null : null;
    const { data, error: e } = await supabase.from('food_log_entries').insert({ ...row, health_external_id: keepLink }).select('id').single();
    setRestoring(false);
    if (e) {
      setActionError(`Could not restore ${undo.entry.name}: ${e.message}`);
      return;
    }
    setUndo(null);
    setActionError(null);
    setNotice(null);
    if (!keepLink) maybeWriteNutrition((data as { id: string }).id);
    invalidateDateHistory();
    load();
  }

  async function logPlanned(entry: MealPlanEntry, recipe: RecipeWithNutrition) {
    if (!session) return;
    const err = await logPlanEntry(session.user.id, recipe, entry);
    setActionError(err ? `Could not log ${recipe.title}: ${err}` : null);
    load();
  }

  async function copyPrevious(meal: Meal) {
    if (!session || copying) return;
    const from = addDays(date, -1);
    const label = mealLabel(meal).toLowerCase();
    setMenuFor(null);
    setCopying(meal);
    setActionError(null);
    setNotice(null);
    const [src, dst] = await Promise.all([
      supabase.from('food_log_entries').select('*').eq('logged_on', from).eq('meal', meal).order('created_at'),
      supabase.from('food_log_entries').select('*').eq('logged_on', date).eq('meal', meal).order('created_at'),
    ]);
    const loadError = src.error ?? dst.error;
    if (loadError) {
      setCopying(null);
      setActionError(`Could not load ${label} to copy: ${loadError.message}`);
      return;
    }
    const source = (src.data as FoodLogEntry[]) ?? [];
    const target = (dst.data as FoodLogEntry[]) ?? [];
    if (!source.length) {
      setCopying(null);
      setNotice(`Nothing was logged for ${label} on ${formatDay(from)}.`);
      return;
    }
    const { toAdd, duplicates } = planMealCopy(source, target);
    if (!toAdd.length) {
      setCopying(null);
      setNotice(`Everything from ${formatDay(from)}'s ${label} is already in this ${label} with the same amounts. Nothing was added.`);
      return;
    }
    const kcal = Math.round(sumEntries(toAdd).calories);
    const lines = [`Add ${toAdd.length} item${toAdd.length === 1 ? '' : 's'} (${kcal} kcal) from ${formatDay(from)}: ${toAdd.map((x) => x.name).join(', ')}.`];
    if (target.length) lines.push(`${mealLabel(meal)} already has ${target.length} item${target.length === 1 ? '' : 's'}; these will be added alongside, not replace them.`);
    if (duplicates.length) lines.push(`Skipping ${duplicates.length} already logged here with the same amount: ${duplicates.map((x) => x.name).join(', ')}.`);
    const ok = await confirm({ title: `Copy ${label}?`, message: lines.join('\n\n'), confirmLabel: `Add ${toAdd.length}` });
    if (!ok) {
      setCopying(null);
      return;
    }
    try {
      const result = await diaryRpc<DiaryTransferResult>('diary_transfer', {
        p_request_id: randomUUID(), p_expected_user_id: session.user.id, p_mode: 'meal',
        p_target_date: date, p_today: toDateString(new Date()), p_entry: null, p_source_date: from, p_target_meal: meal,
      });
      const warning = await mirrorDiaryTransfer(result);
      invalidateDateHistory();
      setNotice(`${result.changed} food${result.changed === 1 ? '' : 's'} copied. ${result.skipped} matching portion${result.skipped === 1 ? '' : 's'} skipped.${warning ? ` ${warning}` : ''}`);
      void load();
    } catch (e) { setActionError(`Could not copy this meal: ${e instanceof Error ? e.message : 'Please retry.'}`); }
    finally { setCopying(null); }
  }

  function openAdd(meal: Meal, target: 'search' | 'scan' | 'recipes' | 'recent') {
    if (date > today) { setActionError('Use Plan for future meals. Completed food can be logged on today or an earlier date.'); return; }
    setAddFor(null);
    if (target === 'scan') router.push({ pathname: '/log/scan', params: { meal, date } });
    else if (target === 'recipes') router.push({ pathname: '/log/recipes', params: { meal, date } });
    else router.push({ pathname: '/log/search', params: { meal, date, filter: target === 'recent' ? 'recent' : 'all' } });
  }

  return (
    <DaySwipe><Screen>
      <TabHeader title="Diary" right={
        <Pressable onPress={() => setSearchOpen((open) => !open)} hitSlop={10} accessibilityRole="button"
          accessibilityLabel={searchOpen ? 'Close food history search' : 'Search food history'} accessibilityState={{ expanded: searchOpen }}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={searchOpen ? 'close' : 'search'} size={24} color={colors.primary} />
        </Pressable>
      } />
      {searchOpen ? <DiaryHistorySearch key={session?.user.id} autoFocus /> : null}
      {welcome.show ? <WelcomeCard onDismiss={welcome.dismiss} /> : checkin.show ? <CheckinCard onDismiss={checkin.dismiss} /> : null}
      {birthdayError ? <Notice tone="danger">{birthdayError}</Notice> : null}
      <DateNavigator />
      {routeError ? <View><Notice tone="danger">{routeError}</Notice><Button title="Dismiss date warning" variant="ghost" onPress={() => setRouteError(null)} /></View> : null}
      {date > today ? <Notice tone="info">Future date: use Plan to schedule meals. Log completed meals on today or an earlier date.</Notice> : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {targets ? (<>
        <HeroCard>
          <Eyebrow onHero>{remaining < 0 ? 'Over target' : 'Remaining today'}</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginTop: spacing.xs }}>
            <Text style={[typography.display, { color: remaining < 0 ? colors.heroDanger : colors.onHero }]}>
              {Math.abs(Math.round(remaining)).toLocaleString()}
            </Text>
            <Text style={[typography.subheading, { color: colors.onHeroMuted, marginLeft: spacing.sm }]}>kcal {remaining < 0 ? 'over' : 'left'}</Text>
          </View>
          <Text style={[typography.small, { color: colors.onHeroMuted }]}>{Math.round(totals.calories).toLocaleString()} of {Math.round(targets.calories).toLocaleString()} eaten</Text>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Calories"
            accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round((totals.calories / Math.max(1, targets.calories)) * 100)) }}
            style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.heroTrack, overflow: 'hidden', marginVertical: spacing.lg }}
          >
            <View style={{ height: 8, borderRadius: radius.pill, width: `${Math.min(100, (totals.calories / Math.max(1, targets.calories)) * 100)}%`, backgroundColor: remaining < 0 ? colors.heroDanger : colors.heroAccent }} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {([['Protein', totals.protein, targets.protein_g, colors.macro.protein], ['Carbs', totals.carbs, targets.carbs_g, colors.macro.carbs], ['Fat', totals.fat, targets.fat_g, colors.macro.fat]] as const).map(([label, value, target, color]) => (
              <View key={label} style={{ flex: 1, minWidth: 0, backgroundColor: colors.heroRaised, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: 10, borderTopWidth: 3, borderTopColor: color }}>
                <Text style={[typography.eyebrow, { color: colors.onHeroMuted, letterSpacing: 0.4 }]} numberOfLines={1}>{label}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.onHero, fontVariant: ['tabular-nums'], marginTop: 2 }} numberOfLines={1}>{Math.round(value)}g</Text>
                <Text style={[typography.small, { color: colors.onHeroMuted }]} numberOfLines={1}>{target > 0 ? `of ${Math.round(target)}g` : 'no target'}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => setDetails(!details)}
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            aria-expanded={details}
            accessibilityLabel={details ? 'Hide nutrition details' : 'Show nutrition details'}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 44, marginTop: spacing.md }}
          >
            <Text style={[typography.label, { color: colors.onHero }]}>{details ? 'Hide details' : 'Nutrition details'}</Text>
            <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={colors.onHero} />
          </Pressable>
        </HeroCard>
        {details ? (
          <Card>
            <View>
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
              <View style={{ marginTop: spacing.md }}>
                <Text style={typography.label}>Micronutrients</Text>
                <Text style={[typography.small, { marginVertical: spacing.xs }]}>
                  FDA adult Daily Values are a general reference, not personal nutrition advice. Unknown source values are not counted as zero.
                </Text>
                {MICRONUTRIENTS.map((item) => {
                  const total = micronutrientTotals[item.key];
                  const complete = entries.length > 0 && total.missingEntries === 0;
                  const reported = total.knownEntries > 0;
                  const amount = total.amount.toLocaleString(undefined, { maximumFractionDigits: 1 });
                  const detail = entries.length === 0 ? 'No foods logged'
                    : !reported ? `Not reported for ${total.missingEntries} foods`
                    : total.missingEntries > 0 ? `${amount} ${item.unit} reported · ${total.missingEntries} foods missing data`
                    : `${amount} / ${item.dailyValue} ${item.unit} · ${Math.round((total.amount / item.dailyValue) * 100)}% DV`;
                  return (
                    <View key={item.key} style={{ marginTop: spacing.xs }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                        <Text style={typography.body}>{item.label}</Text>
                        <Text style={[typography.small, { textAlign: 'right', flexShrink: 1 }]}>{detail}</Text>
                      </View>
                      {complete ? (
                        <View accessibilityRole="progressbar"
                          accessibilityLabel={`${item.label} percent of general adult Daily Value`}
                          accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round((total.amount / item.dailyValue) * 100)) }}
                          style={{ height: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 4 }}>
                          <View style={{ height: 5, width: `${Math.min(100, (total.amount / item.dailyValue) * 100)}%`, backgroundColor: colors.primary }} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          </Card>
        ) : null}
      </>) : null}

      <Button title="Add food" icon="add-circle-outline" onPress={() => setAddFor(addFor === 'top' ? null : 'top')} />
      {addFor === 'top' ? (
        <Card>
          <Text style={typography.label}>Add to</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
            {MEALS.map((m) => (
              <Pressable key={m.key} onPress={() => setTopMeal(m.key)} accessibilityRole="button" accessibilityState={{ selected: topMeal === m.key }} aria-selected={topMeal === m.key}
                style={{ paddingHorizontal: spacing.md, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: topMeal === m.key ? colors.primary : colors.border, backgroundColor: topMeal === m.key ? colors.primary : 'transparent' }}>
                <Text style={[typography.small, { color: topMeal === m.key ? colors.onPrimary : colors.text, fontWeight: '600' }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          <AddOptions onPick={(t) => openAdd(topMeal, t)} />
        </Card>
      ) : null}
      <View style={{ height: spacing.md }} />

      {entries.length ? <Button title="Copy this day to another date" variant="ghost" icon="copy-outline" onPress={() => setTransfer({ mode: 'day', sourceDate: date })} /> : null}
      {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
      {undo ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.md, borderRadius: radius.md, backgroundColor: colors.text }}>
          <Text style={[typography.body, { flex: 1, color: colors.surface }]} numberOfLines={2}>Removed {undo.entry.name}</Text>
          <Pressable onPress={undoRemove} disabled={restoring} aria-disabled={restoring} aria-busy={restoring} accessibilityRole="button" accessibilityLabel={`Undo removing ${undo.entry.name}`} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm, opacity: restoring ? 0.5 : 1 }}>
            <Text style={[typography.body, { color: colors.surface, fontWeight: '700' }]}>{restoring ? 'Restoring…' : 'Undo'}</Text>
          </Pressable>
          <Pressable onPress={() => setUndo(null)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.surface} />
          </Pressable>
        </View>
      ) : null}
      {notice ? <Notice tone="info">{notice}</Notice> : null}
      {!welcome.show && plansLoadedFor === viewKey && !error && date >= today && !entries.length && !planned.length ? (
        <Card accent={colors.hero}>
          <Eyebrow>{date === today ? 'Nothing planned today' : `Nothing planned for ${formatDay(date)}`}</Eyebrow>
          <Text style={typography.small}>Let Buko plan the rest of your week around your targets.</Text>
          <Button title="Generate my week" icon="sparkles-outline" variant="secondary" onPress={() => router.push({ pathname: '/(tabs)/plan', params: { generate: '1' } })} />
        </Card>
      ) : null}

      <CardGrid>{MEALS.map(({ key, label }) => {
        const items = entries.filter((e) => e.meal === key);
        const kcal = items.reduce((s, e) => s + Number(e.calories), 0);
        const mealPlans = planned.filter((p) => p.meal === key);
        return (
          <Card key={key}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={typography.subheading}>{label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[typography.small, { marginRight: spacing.sm }]}>{Math.round(kcal)} kcal</Text>
                <Pressable
                  onPress={() => { setAddFor(null); setMenuFor(menuFor === key ? null : key); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: menuFor === key }}
                  aria-expanded={menuFor === key}
                  accessibilityLabel={`More options for ${label}`}
                  style={{ minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.primary} />
                </Pressable>
                <Pressable
                  onPress={() => { setMenuFor(null); setAddFor(addFor === key ? null : key); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: addFor === key }}
                  aria-expanded={addFor === key}
                  accessibilityLabel={`Add to ${label}`}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36, paddingHorizontal: spacing.sm }}
                >
                  <Ionicons name={addFor === key ? 'close-circle' : 'add-circle'} size={22} color={colors.primary} />
                  <Text style={[typography.body, { color: colors.primary, fontWeight: '600', marginLeft: 4 }]}>Add</Text>
                </Pressable>
              </View>
            </View>
            {menuFor === key ? (
              <Pressable
                onPress={() => copyPrevious(key)}
                disabled={copying !== null}
                aria-disabled={copying !== null}
                aria-busy={copying === key}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft, opacity: copying !== null ? 0.5 : 1 }}
              >
                <Ionicons name="copy-outline" size={18} color={colors.primary} />
                <Text style={[typography.body, { color: colors.primary, marginLeft: spacing.sm, fontWeight: '600' }]}>
                  {copying === key ? 'Copying…' : `Copy ${label.toLowerCase()} from ${formatDay(addDays(date, -1)).toLowerCase()}`}
                </Text>
              </Pressable>
            ) : null}
            {addFor === key ? <AddOptions onPick={(t) => openAdd(key, t)} /> : null}
            {items.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/log/add', params: { entry: e.id } })}
                onLongPress={() => setActionEntry(e)}
                accessibilityRole="button"
                accessibilityHint="Tap to edit. Long press for favorites, move or copy."
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={typography.body} numberOfLines={1}>{e.name}</Text>
                  <Text style={typography.small}>
                    {e.unit === 'serving' ? `${Number(e.quantity)} serving${Number(e.quantity) === 1 ? '' : 's'} · ` : ''}{Math.round(e.grams)} g · P {Math.round(e.protein_g)} · C {Math.round(e.carbs_g)} · F {Math.round(e.fat_g)}
                  </Text>
                </View>
                <Text style={typography.body}>{Math.round(e.calories)}</Text>
                <Pressable onPress={(event) => { event.stopPropagation(); setActionEntry(e); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Actions for ${e.name}`} style={{ marginLeft: spacing.md, minHeight: 44, justifyContent: 'center' }}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.primary} />
                </Pressable>
                <Pressable onPress={(event) => { event.stopPropagation(); void confirmDelete(e); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${e.name}`} style={{ marginLeft: spacing.md }}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
                </Pressable>
              </Pressable>
            ))}
            {mealPlans.map((p) => {
              const r = recipes.find((x) => x.id === p.recipe_id);
              if (!r) return null;
              const n = computeRecipeNutrition(r.recipe_ingredients, r.servings);
              const incomplete = recipeNutritionMessage(n);
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, opacity: 0.9 }}>
                  <Ionicons name="calendar-outline" size={18} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body} numberOfLines={1}>{r.title}</Text>
                    <Text style={typography.small}>Planned · {p.servings} serving{p.servings === 1 ? '' : 's'}{incomplete ? ' · nutrition incomplete' : ` · ${Math.round(n.perServing.calories * p.servings)} kcal`}</Text>
                  </View>
                  {incomplete ? (
                    <Pressable onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })} accessibilityRole="button" accessibilityLabel={`Fix nutrition for ${r.title}`} style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted }}>
                      <Text style={[typography.small, { color: colors.primary, fontWeight: '700' }]}>Fix</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => logPlanned(p, r)} accessibilityRole="button" accessibilityLabel={`Log ${r.title}`} style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.primary }}>
                      <Text style={[typography.small, { color: colors.onPrimary, fontWeight: '700' }]}>Log</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
        );
      })}</CardGrid>

      <View style={{ height: spacing.md }} />
      <CoachDiaryPanel day={date} today={today} targets={targets} />
      <EntryActionsSheet entry={actionEntry} onClose={() => setActionEntry(null)} onTransfer={(mode, entry) => { setActionEntry(null); setTransfer({ mode, entry }); }} />
      <DiaryTransferSheet selection={transfer} onClose={() => setTransfer(null)} onSaved={(message) => { setNotice(message); void load(); }} />
    </Screen></DaySwipe>
  );
}
