import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { Button, Card, Chip, ChipRow, Empty, Heading, Label, Notice, Screen } from '../../src/components/ui';
import { searchProducts } from '../../src/lib/api/openFoodFacts';
import { searchWholeFoods } from '../../src/lib/api/usda';
import { defaultMeal, MEALS, toDateString } from '../../src/lib/diary';
import {
  buildEntryInsert, createLatestGate, incompleteNutritionMessage, matchesQuery, recentFoods, sourcesForFilter,
  type EntryInsert, type RecentFood, type SearchFilter,
} from '../../src/lib/foodLogging';
import { maybeWriteNutrition } from '../../src/lib/health';
import type { RecipeWithNutrition } from '../../src/lib/recipes/logging';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Food, FoodLogEntry, Meal } from '../../src/types';

const FILTERS: { key: SearchFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'recent', label: 'Recent' },
  { key: 'whole', label: 'Whole foods' },
  { key: 'packaged', label: 'Packaged' },
  { key: 'recipes', label: 'Recipes' },
];

function nutritionLine(food: Food): string {
  const brand = food.brand ? `${food.brand} · ` : '';
  if (incompleteNutritionMessage(food.per100g)) return `${brand}Nutrition incomplete`;
  return `${brand}${Math.round(food.per100g.calories!)} kcal per 100 g`;
}

function Row({ title, subtitle, warn, icon = 'add-circle', selected, onPress, label }: {
  title: string; subtitle: string; warn?: boolean; icon?: 'add-circle' | 'chevron-forward'; selected?: boolean | null; onPress(): void; label: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole={selected == null ? 'button' : 'checkbox'} accessibilityState={selected == null ? undefined : { checked: selected }} aria-checked={selected == null ? undefined : selected} accessibilityLabel={label}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md }}>
        {selected != null ? <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} style={{ marginRight: spacing.md }} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={typography.subheading} numberOfLines={2}>{title}</Text>
          <Text style={[typography.small, warn ? { color: colors.warning } : null]} numberOfLines={2}>{subtitle}</Text>
        </View>
        {selected == null ? <Ionicons name={icon} size={icon === 'add-circle' ? 26 : 20} color={icon === 'add-circle' ? colors.primary : colors.textMuted} /> : null}
      </Card>
    </Pressable>
  );
}

interface Remote { query: string; whole: Food[] | null; packaged: Food[] | null }

export default function SearchFood() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ meal?: string; date?: string; filter?: string }>();
  const date = params.date ?? toDateString(new Date());
  const initialFilter = FILTERS.find((f) => f.key === params.filter)?.key ?? 'all';
  const [filter, setFilter] = useState<SearchFilter>(initialFilter);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Remote | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [recent, setRecent] = useState<RecentFood[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeWithNutrition[] | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [meal, setMeal] = useState<Meal>((MEALS.find((m) => m.key === params.meal)?.key ?? defaultMeal()) as Meal);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const gate = useRef(createLatestGate()).current;

  useEffect(() => () => gate.cancel(), [gate]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      supabase.from('food_log_entries').select('*').order('created_at', { ascending: false }).limit(150).then(({ data, error }) => {
        if (!active) return;
        if (error) setRecentError(`Could not load recent foods: ${error.message}`);
        else { setRecentError(null); setRecent(recentFoods((data as FoodLogEntry[]) ?? [], 20)); }
      });
      supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)').order('title').then(({ data, error }) => {
        if (!active) return;
        if (error) setRecipeError(`Could not load your recipes: ${error.message}`);
        else { setRecipeError(null); setRecipes(data as RecipeWithNutrition[]); }
      });
      return () => { active = false; };
    }, []),
  );

  const runSearch = useCallback(async (q: string, f: SearchFilter, previous: Remote | null) => {
    const need = sourcesForFilter(f);
    const reuse = previous && previous.query === q ? previous : null;
    const wantWhole = need.whole && !reuse?.whole;
    const wantPackaged = need.packaged && !reuse?.packaged;
    if (!wantWhole && !wantPackaged) {
      setRemote(reuse ?? { query: q, whole: null, packaged: null });
      return;
    }
    const token = gate.start();
    setLoading(true);
    setErrors([]);
    const [w, p] = await Promise.allSettled([
      wantWhole ? searchWholeFoods(q) : Promise.resolve(reuse?.whole ?? null),
      wantPackaged ? searchProducts(q) : Promise.resolve(reuse?.packaged ?? null),
    ]);
    if (!gate.isLatest(token)) return;
    const reason = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? String((r.reason as Error)?.message ?? 'Search failed.') : null);
    const errs: string[] = [];
    if (reason(w)) errs.push(`Whole foods (USDA): ${reason(w)}`);
    if (reason(p)) errs.push(`Packaged products (Open Food Facts): ${reason(p)}`);
    setRemote({
      query: q,
      whole: w.status === 'fulfilled' ? w.value : null,
      packaged: p.status === 'fulfilled' ? p.value : null,
    });
    setErrors(errs);
    setLoading(false);
  }, [gate]);

  function submit() {
    const q = query.trim();
    if (!q) return;
    setRemote(null);
    setSubmitted(q);
    runSearch(q, filter, null);
  }

  function clear() {
    gate.cancel();
    setQuery('');
    setSubmitted(null);
    setRemote(null);
    setErrors([]);
    setLoading(false);
  }

  function chooseFilter(f: SearchFilter) {
    setFilter(f);
    if (f !== 'recent') setSelecting(false);
    if (submitted) runSearch(submitted, f, remote);
  }

  const pick = (food: Food, extra?: { amount: string; unit: string }) =>
    router.push({ pathname: '/log/add', params: { food: JSON.stringify(food), meal, date, ...extra } });

  const q = query.trim();
  const searchedQ = remote?.query ?? null;
  const show = { recent: filter === 'all' || filter === 'recent', recipes: filter === 'all' || filter === 'recipes', ...sourcesForFilter(filter) };
  const recentList = (recent ?? []).filter((r) => !q || matchesQuery(`${r.food.name} ${r.food.brand ?? ''}`, q));
  const recipeList = (recipes ?? []).filter((r) => !q || matchesQuery(r.title, q));
  const recentShown = filter === 'all' && q ? recentList.slice(0, 5) : recentList;
  const recipeShown = filter === 'all' ? (q ? recipeList.slice(0, 5) : []) : recipeList;

  function toggle(r: RecentFood) {
    setSelected((s) => {
      const next = { ...s };
      if (r.key in next) delete next[r.key];
      else next[r.key] = String(r.last.quantity);
      return next;
    });
    setAddError(null);
  }

  const selectedFoods = (recent ?? []).filter((r) => r.key in selected);

  async function addSelected() {
    if (!session || !selectedFoods.length) return;
    const rows: EntryInsert[] = [];
    for (const r of selectedFoods) {
      const built = buildEntryInsert(r.food, { userId: session.user.id, date, meal, amount: selected[r.key], unit: r.last.unit });
      if ('error' in built) return setAddError(`${r.food.name}: ${built.error}`);
      rows.push(built.row);
    }
    setAdding(true);
    setAddError(null);
    const { data, error } = await supabase.from('food_log_entries').insert(rows).select('id');
    if (error) {
      setAddError(`Nothing was added: ${error.message}`);
      setAdding(false);
      return;
    }
    for (const { id } of (data as { id: string }[]) ?? []) maybeWriteNutrition(id);
    router.navigate({ pathname: '/(tabs)', params: { date } });
  }

  const remoteHeading = (title: string) => <><View style={{ height: spacing.sm }} /><Heading>{title}</Heading><View style={{ height: spacing.md }} /></>;
  const noResults = !loading && searchedQ !== null && !errors.length
    && (!show.whole || !remote?.whole?.length) && (!show.packaged || !remote?.packaged?.length)
    && (!show.recent || !recentList.length) && (!show.recipes || !recipeList.length);

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Button title="Scan barcode" icon="barcode-outline" variant="secondary" onPress={() => router.push({ pathname: '/log/scan', params: { meal, date } })} /></View>
        <View style={{ flex: 1 }}><Button title="Enter manually" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/log/manual', params: { meal, date } })} /></View>
      </View>
      <View style={{ height: spacing.md }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md }}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            accessibilityLabel="Search foods"
            placeholder="e.g. banana or oat milk"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={submit}
            autoCorrect={false}
            style={[typography.body, { flex: 1, minHeight: 48, marginLeft: spacing.sm }]}
          />
          {query ? (
            <Pressable onPress={clear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={submit}
          disabled={!q || loading}
          accessibilityRole="button"
          accessibilityLabel="Search"
          accessibilityState={{ disabled: !q || loading }}
          aria-disabled={!q || loading}
          style={{ minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md, justifyContent: 'center', backgroundColor: colors.primary, opacity: !q || loading ? 0.5 : 1 }}
        >
          <Text style={[typography.body, { color: colors.onPrimary, fontWeight: '700' }]}>Search</Text>
        </Pressable>
      </View>
      <ChipRow>
        {FILTERS.map((f) => <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => chooseFilter(f.key)} />)}
      </ChipRow>
      <View style={{ height: spacing.md }} />
      {(filter === 'whole' || filter === 'packaged' || filter === 'all') && searchedQ === null && !loading ? (
        <Text style={[typography.small, { marginBottom: spacing.md }]}>
          {filter === 'all' ? 'Recent foods and recipes filter as you type. ' : ''}Press Search to look up {filter === 'packaged' ? 'packaged products' : filter === 'whole' ? 'whole foods' : 'whole foods and packaged products'}.
        </Text>
      ) : null}

      {loading ? <View style={{ flexDirection: 'row', alignItems: 'center', margin: spacing.md }}><ActivityIndicator color={colors.primary} /><Text style={[typography.small, { marginLeft: spacing.sm }]}>Searching…</Text></View> : null}
      {errors.map((e) => <Notice key={e} tone="danger">{e}</Notice>)}

      {show.recent ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Heading>Recent foods</Heading>
            {filter === 'recent' && recentList.length ? (
              <Pressable onPress={() => { setSelecting(!selecting); setSelected({}); setAddError(null); }} hitSlop={8} accessibilityRole="button">
                <Text style={[typography.body, { color: colors.primary, fontWeight: '600' }]}>{selecting ? 'Cancel' : 'Select several'}</Text>
              </Pressable>
            ) : null}
          </View>
          {recentError ? <Notice tone="danger">{recentError}</Notice> : null}
          {recent === null && !recentError ? <ActivityIndicator color={colors.primary} /> : null}
          {recent?.length === 0 ? <Empty icon="time-outline" text="Foods you log will show up here for quick re-adding." /> : null}
          {recent?.length && !recentList.length ? <Text style={[typography.small, { marginBottom: spacing.md }]}>No recent foods match “{q}”.</Text> : null}
          {recentShown.map((r) => {
            const amount = r.last.unit === 'serving' ? `${r.last.quantity} serving${r.last.quantity === 1 ? '' : 's'} (${Math.round(r.lastGrams)} g)` : `${Math.round(r.lastGrams)} g`;
            const kcal = Math.round((r.food.per100g.calories ?? 0) * r.lastGrams / 100);
            return (
              <View key={r.key}>
                <Row
                  title={r.food.name}
                  subtitle={`Last: ${amount} · ${kcal} kcal`}
                  selected={selecting ? r.key in selected : null}
                  label={selecting ? `Select ${r.food.name}` : `Log ${r.food.name}`}
                  onPress={() => (selecting ? toggle(r) : pick(r.food, { amount: String(r.last.quantity), unit: r.last.unit }))}
                />
                {selecting && r.key in selected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.md }}>
                    <Text style={[typography.small, { flex: 1 }]}>{r.last.unit === 'serving' ? 'Servings' : 'Grams'}</Text>
                    <TextInput
                      accessibilityLabel={`Amount of ${r.food.name} in ${r.last.unit === 'serving' ? 'servings' : 'grams'}`}
                      value={selected[r.key]}
                      onChangeText={(t) => { setSelected((s) => ({ ...s, [r.key]: t })); setAddError(null); }}
                      keyboardType="decimal-pad"
                      style={[typography.body, { width: 96, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, textAlign: 'right' }]}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
          {filter === 'all' && q && recentList.length > recentShown.length ? (
            <Pressable onPress={() => chooseFilter('recent')} accessibilityRole="button"><Text style={[typography.body, { color: colors.primary, marginBottom: spacing.md }]}>Show all {recentList.length} recent matches</Text></Pressable>
          ) : null}
          {selecting ? (
            <Card>
              <Label>Add to</Label>
              <ChipRow>{MEALS.map((m) => <Chip key={m.key} label={m.label} selected={meal === m.key} onPress={() => setMeal(m.key)} />)}</ChipRow>
              <View style={{ height: spacing.md }} />
              {addError ? <Notice tone="danger">{addError}</Notice> : null}
              <Button
                title={selectedFoods.length ? `Add ${selectedFoods.length} food${selectedFoods.length === 1 ? '' : 's'} to ${MEALS.find((m) => m.key === meal)!.label}` : 'Select foods to add'}
                onPress={addSelected}
                loading={adding}
                disabled={!selectedFoods.length}
              />
            </Card>
          ) : null}
        </>
      ) : null}

      {show.recipes && (filter === 'recipes' || recipeShown.length) ? (
        <>
          <View style={{ height: spacing.sm }} />
          <Heading>Your recipes</Heading>
          <View style={{ height: spacing.md }} />
          {recipeError ? <Notice tone="danger">{recipeError}</Notice> : null}
          {filter === 'recipes' && recipes?.length === 0 ? <Empty icon="book-outline" text="No recipes yet. Add some in the Recipes tab." /> : null}
          {filter === 'recipes' && recipes?.length && !recipeList.length ? <Text style={typography.small}>No recipes match “{q}”.</Text> : null}
          {recipeShown.map((r) => {
            const n = computeRecipeNutrition(r.recipe_ingredients, r.servings);
            return (
              <Row
                key={r.id}
                title={r.title}
                subtitle={n.complete ? `${Math.round(n.perServing.calories)} kcal per serving` : 'Nutrition incomplete · edit the recipe before logging'}
                warn={!n.complete}
                icon="chevron-forward"
                label={`Log recipe ${r.title}`}
                onPress={() => router.push(n.complete ? { pathname: '/cook/finish', params: { id: r.id, direct: '1', meal, date } } : { pathname: '/recipe/[id]', params: { id: r.id } })}
              />
            );
          })}
        </>
      ) : null}

      {show.whole && remote?.whole?.length ? remoteHeading('Whole foods') : null}
      {show.whole ? remote?.whole?.map((f) => <Row key={`u${f.sourceId}`} title={f.name} subtitle={nutritionLine(f)} warn={Boolean(incompleteNutritionMessage(f.per100g))} label={`Log ${f.name}`} onPress={() => pick(f)} />) : null}
      {show.packaged && remote?.packaged?.length ? remoteHeading('Packaged products') : null}
      {show.packaged ? remote?.packaged?.map((f) => <Row key={`o${f.sourceId}`} title={f.name} subtitle={nutritionLine(f)} warn={Boolean(incompleteNutritionMessage(f.per100g))} label={`Log ${f.name}`} onPress={() => pick(f)} />) : null}
      {noResults ? <Empty icon="search-outline" text={`No results for “${searchedQ}”.`} /> : null}
      {searchedQ !== null && !loading && (show.whole || show.packaged) ? (
        <Button title="Can't find it? Enter nutrition manually" variant="ghost" onPress={() => router.push({ pathname: '/log/manual', params: { meal, date } })} />
      ) : null}
      <Attribution usda />
    </Screen>
  );
}
