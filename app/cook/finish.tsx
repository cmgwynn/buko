import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Heading, Label, Loading, Notice, Screen } from '../../src/components/ui';
import { defaultMeal, MEALS, round1, toDateString } from '../../src/lib/diary';
import { maybeWriteNutrition } from '../../src/lib/health';
import { recordRecipeCooked } from '../../src/lib/recipes/activityClient';
import { loadRecipe, type RecipeFull } from '../../src/lib/recipes/db';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';

const stepBtn = { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' } as const;

export default function FinishCooking() {
  const router = useRouter();
  const { session } = useAuth();
  const { id, entry, direct, meal: mealParam, date: dateParam } = useLocalSearchParams<{ id: string; servings?: string; entry?: string; direct?: string; meal?: string; date?: string }>();
  const [full, setFull] = useState<RecipeFull | null>(null);
  const [eaten, setEaten] = useState(1);
  const [meal, setMeal] = useState<Meal>((MEALS.find((m) => m.key === mealParam)?.key ?? defaultMeal()) as Meal);
  const [date, setDate] = useState(dateParam ?? toDateString(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooked, setCooked] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [cookedError, setCookedError] = useState<string | null>(null);
  const recordedFor = useRef<string | null>(null);

  // Reaching this screen from cook mode means cooking finished; direct "Log a recipe" is not a cook.
  async function recordCooked() {
    if (direct || !session || !full) return;
    recordedFor.current = full.recipe.id;
    setCooked('saving'); setCookedError(null);
    try { await recordRecipeCooked(session.user.id, full.recipe.id); setCooked('saved'); }
    catch (e) { setCookedError(e instanceof Error ? e.message : null); setCooked('failed'); }
  }
  useEffect(() => {
    if (full && !direct && session && recordedFor.current !== full.recipe.id) void recordCooked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, direct, session?.user.id]);

  useEffect(() => {
    loadRecipe(id).then(setFull).catch((e) => setError(e.message));
    if (entry) {
      supabase.from('meal_plan_entries').select('meal, planned_on, servings').eq('id', entry).single().then(({ data }) => {
        if (data) {
          setMeal(data.meal as Meal);
          setDate(data.planned_on as string);
          setEaten(Number(data.servings) > 0 ? Number(data.servings) : 1);
        }
      });
    }
  }, [id, entry]);

  const nutrition = useMemo(() => (full ? computeRecipeNutrition(full.ingredients, full.recipe.servings) : null), [full]);

  if (!full || !nutrition) return error ? <Screen><Notice tone="danger">{error}</Notice></Screen> : <Loading />;

  const kcal = nutrition.perServing.calories * eaten;
  const canLog = nutrition.counted > 0;

  async function log() {
    if (!session || !full || !nutrition) return;
    setBusy(true);
    setError(null);
    const ps = nutrition.perServing;
    const { data: inserted, error: e } = await supabase.from('food_log_entries').insert({
      user_id: session.user.id,
      logged_on: date,
      meal,
      source: 'recipe',
      source_id: full.recipe.id,
      name: full.recipe.title,
      brand: null,
      quantity: eaten,
      unit: 'serving',
      grams: round1(Math.max(1, nutrition.perServingGrams * eaten)),
      calories: round1(ps.calories * eaten),
      protein_g: round1(ps.protein_g * eaten),
      carbs_g: round1(ps.carbs_g * eaten),
      fat_g: round1(ps.fat_g * eaten),
    }).select('id').single();
    if (e) {
      setError(e.message);
      setBusy(false);
      return;
    }
    maybeWriteNutrition((inserted as { id: string }).id);
    if (entry) await supabase.from('meal_plan_entries').update({ logged_at: new Date().toISOString() }).eq('id', entry);
    router.dismissAll();
    router.navigate('/(tabs)');
  }

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
        <Ionicons name={direct ? 'restaurant' : 'checkmark-circle'} size={56} color={colors.primary} />
        <Heading>{direct ? 'Log a recipe' : 'Nice cooking!'}</Heading>
        <Body muted>{direct ? `How much ${full.recipe.title} did you eat?` : `Log how much you ate of ${full.recipe.title}.`}</Body>
      </View>

      <Card>
        <Label>Servings eaten</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: spacing.sm }}>
          <Pressable onPress={() => setEaten(Math.max(0.5, eaten - 0.5))} style={stepBtn} accessibilityLabel="Less">
            <Ionicons name="remove" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[typography.title, { marginHorizontal: spacing.xl }]}>{eaten}</Text>
          <Pressable onPress={() => setEaten(eaten + 0.5)} style={stepBtn} accessibilityLabel="More">
            <Ionicons name="add" size={22} color={colors.primary} />
          </Pressable>
        </View>
        <Text style={[typography.body, { textAlign: 'center' }]}>
          {Math.round(kcal)} kcal · P {Math.round(nutrition.perServing.protein_g * eaten)} · C {Math.round(nutrition.perServing.carbs_g * eaten)} · F {Math.round(nutrition.perServing.fat_g * eaten)} g
        </Text>
        <Text style={[typography.small, { textAlign: 'center', marginTop: 4 }]}>The recipe makes {full.recipe.servings} servings.</Text>
      </Card>

      <Label>Meal</Label>
      <ChipRow>
        {MEALS.map((m) => <Chip key={m.key} label={m.label} selected={meal === m.key} onPress={() => setMeal(m.key)} />)}
      </ChipRow>
      <View style={{ height: spacing.lg }} />
      {!canLog ? <Notice>This recipe has no nutrition data yet, so it can&apos;t be logged. Edit the recipe and match its ingredients first.</Notice> : null}
      {cooked === 'saved' ? <Body muted>Added to your recently cooked recipes.</Body> : null}
      {cooked === 'failed' ? <Notice tone="danger">Couldn&apos;t add this to recently cooked{cookedError ? ` (${cookedError})` : ''}. Logging still works.</Notice> : null}
      {cooked === 'failed' ? <Button title="Retry recently cooked" variant="secondary" onPress={() => void recordCooked()} /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button title="Log to diary" onPress={log} loading={busy} disabled={!canLog} />
      {direct ? null : <Button title="Skip logging" variant="ghost" onPress={() => { router.dismissAll(); router.navigate('/(tabs)'); }} />}
    </Screen>
  );
}
