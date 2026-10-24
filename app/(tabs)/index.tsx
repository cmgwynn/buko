import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MacroBar } from '../../src/components/MacroBar';
import { CoachDiaryPanel } from '../../src/components/CoachDiaryPanel';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, CardGrid, Heading, Notice, Screen } from '../../src/components/ui';
import { addDays, defaultMeal, formatDay, MEALS, toDateString } from '../../src/lib/diary';
import { copyEntryRows, planMealCopy, restoreEntryRow, sumEntries } from '../../src/lib/foodLogging';
import { activityAdjustedTargets } from '../../src/lib/fitness/calc';
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

type IconName = ComponentProps<typeof Ionicons>['name'];
const mealLabel = (m: Meal) => MEALS.find((x) => x.key === m)!.label;
const isDateString = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

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
  const { targets: baseTargets, profile, age, today, birthdayError } = useProfile();
  const { settings } = useSettings();
  const [burned, setBurned] = useState(0);
  const { session } = useAuth();
  const [planned, setPlanned] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithNutrition[]>([]);
  const [date, setDate] = useState(toDateString(new Date()));
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [addFor, setAddFor] = useState<Meal | 'top' | null>(null);
  const [topMeal, setTopMeal] = useState<Meal>(defaultMeal());
  const [copying, setCopying] = useState<Meal | null>(null);
  const [menuFor, setMenuFor] = useState<Meal | null>(null);
  const [undo, setUndo] = useState<{ entry: FoodLogEntry; removal: Promise<HealthRemoval> } | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (isDateString(params.date) && params.date <= toDateString(new Date())) setDate(params.date);
  }, [params.date]);

  useEffect(() => {
    setActionError(null);
    setNotice(null);
    setAddFor(null);
    setMenuFor(null);
    setUndo(null);
  }, [date]);

  const load = useCallback(async () => {
    const [log, plan, rec] = await Promise.all([
      supabase.from('food_log_entries').select('*').eq('logged_on', date).order('created_at'),
      supabase.from('meal_plan_entries').select('*').eq('planned_on', date).is('logged_at', null).order('created_at'),
      supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)'),
    ]);
    if (log.error) setError(`Could not load your diary: ${log.error.message}`);
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

  const totals = sumEntries(entries);
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
    const { data: inserted, error: insertError } = await supabase
      .from('food_log_entries')
      .insert(copyEntryRows(toAdd, { userId: session.user.id, date, meal }))
      .select('id');
    setCopying(null);
    if (insertError) {
      setActionError(`Nothing was copied: ${insertError.message}`);
      return;
    }
    for (const { id } of (inserted as { id: string }[]) ?? []) maybeWriteNutrition(id);
    load();
  }

  function openAdd(meal: Meal, target: 'search' | 'scan' | 'recipes' | 'recent') {
    setAddFor(null);
    if (target === 'scan') router.push({ pathname: '/log/scan', params: { meal, date } });
    else if (target === 'recipes') router.push({ pathname: '/log/recipes', params: { meal, date } });
    else router.push({ pathname: '/log/search', params: { meal, date, filter: target === 'recent' ? 'recent' : 'all' } });
  }

  const isToday = date === toDateString(new Date());
  const pct = (v: number, t: number) => (t > 0 ? `${Math.round(v)}/${Math.round(t)} g` : `${Math.round(v)} g`);

  return (
    <Screen>
      <TabHeader title="Diary" />
      {birthdayError ? <Notice tone="danger">{birthdayError}</Notice> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <Pressable onPress={() => setDate(addDays(date, -1))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous day">
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Heading>{formatDay(date)}</Heading>
        <Pressable onPress={() => setDate(addDays(date, 1))} disabled={isToday} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next day" accessibilityState={{ disabled: isToday }} aria-disabled={isToday} style={{ opacity: isToday ? 0.25 : 1 }}>
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {targets ? (
        <Card style={{ paddingVertical: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 32, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'], color: remaining < 0 ? colors.danger : colors.primary }}>
                {Math.abs(Math.round(remaining)).toLocaleString()}
              </Text>
              <Text style={[typography.body, { marginLeft: spacing.xs }]}>kcal {remaining < 0 ? 'over' : 'left'}</Text>
            </View>
            <Text style={typography.small}>{Math.round(totals.calories).toLocaleString()} of {Math.round(targets.calories).toLocaleString()} eaten</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Calories"
            accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.round((totals.calories / Math.max(1, targets.calories)) * 100)) }}
            style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginVertical: spacing.sm }}
          >
            <View style={{ height: 6, width: `${Math.min(100, (totals.calories / Math.max(1, targets.calories)) * 100)}%`, backgroundColor: remaining < 0 ? colors.danger : colors.macro.calories }} />
          </View>
          <Pressable
            onPress={() => setDetails(!details)}
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            aria-expanded={details}
            accessibilityLabel={details ? 'Hide nutrition details' : 'Show nutrition details'}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}
          >
            <Text style={[typography.small, { flex: 1 }]}>
              P {pct(totals.protein, targets.protein_g)} · C {pct(totals.carbs, targets.carbs_g)} · F {pct(totals.fat, targets.fat_g)}
            </Text>
            <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          </Pressable>
          {details ? (
            <View style={{ marginTop: spacing.md }}>
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
            </View>
          ) : null}
        </Card>
      ) : null}

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
                accessibilityRole="button"
                accessibilityHint="Edit amount or meal"
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, minHeight: 44 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={typography.body} numberOfLines={1}>{e.name}</Text>
                  <Text style={typography.small}>
                    {e.unit === 'serving' ? `${Number(e.quantity)} serving${Number(e.quantity) === 1 ? '' : 's'} · ` : ''}{Math.round(e.grams)} g · P {Math.round(e.protein_g)} · C {Math.round(e.carbs_g)} · F {Math.round(e.fat_g)}
                  </Text>
                </View>
                <Text style={typography.body}>{Math.round(e.calories)}</Text>
                <Pressable onPress={() => confirmDelete(e)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${e.name}`} style={{ marginLeft: spacing.md }}>
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
    </Screen>
  );
}
