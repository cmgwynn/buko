import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { FactorCard } from '../../src/components/FactorCard';
import { RecipeImage } from '../../src/components/RecipeImage';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { Body, Button, Card, Chip, ChipRow, Disclosure, Heading, Label, Loading, Notice, Screen } from '../../src/components/ui';
import { addDays, defaultMeal, MEALS } from '../../src/lib/diary';
import { getFavoriteRecipeIds, getRecentlyCookedRecipes, recordRecipeCooked, setRecipeFavorite } from '../../src/lib/recipes/activityClient';
import { deleteRecipe, draftFromFull, loadRecipe, type RecipeFull } from '../../src/lib/recipes/db';
import { setDraft } from '../../src/lib/recipes/draft';
import { computeRecipeNutrition, recipeNutritionMessage, scoreRecipe } from '../../src/lib/recipes/nutrition';
import { formatQuantity, scaleQuantity } from '../../src/lib/recipes/units';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useSelectedDate } from '../../src/providers/SelectedDateProvider';
import { useBilling } from '../../src/providers/BillingProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';

const stepBtn = { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' } as const;

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { session } = useAuth();
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const billing = useBilling();
  const [full, setFull] = useState<RecipeFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planDate, setPlanDate] = useState(selectedDate);
  const [planMeal, setPlanMeal] = useState<Meal>(defaultMeal());
  const [planned, setPlanned] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [recentlyCooked, setRecentlyCooked] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityReady, setActivityReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setActivityError(null);
      loadRecipe(id)
        .then((f) => {
          setFull(f);
          setServings((cur) => cur ?? f.recipe.servings);
        })
        .catch((e) => setError(e.message));
      if (session) {
        setActivityReady(false);
        Promise.all([getFavoriteRecipeIds(session.user.id), getRecentlyCookedRecipes(session.user.id)])
          .then(([favorites, recent]) => {
            setFavorite(favorites.includes(id));
            setRecentlyCooked(recent.some((entry) => entry.recipeId === id));
            setActivityReady(true);
          })
          .catch((e) => setActivityError(e instanceof Error ? e.message : 'Could not load recipe activity.'));
      }
    }, [id, session?.user.id]),
  );

  const nutrition = useMemo(() => (full ? computeRecipeNutrition(full.ingredients, full.recipe.servings) : null), [full]);
  const result = useMemo(() => (full && nutrition?.scoreEligible ? scoreRecipe(full.recipe.title, nutrition) : null), [full, nutrition]);

  if (error) return <Screen><Notice tone="danger">{error}</Notice></Screen>;
  if (!full || !nutrition || servings === null) return <Loading />;
  const { recipe, ingredients, steps } = full;
  const totalWeight = result ? result.factors.reduce((s, f) => s + f.weight, 0) : 1;
  const scaled = servings !== recipe.servings;

  function ingredientText(ing: (typeof ingredients)[number]): string {
    if (!scaled || ing.quantity === null) return ing.raw_text;
    const q = scaleQuantity(ing.quantity, recipe.servings, servings!)!;
    return `${formatQuantity(q)}${ing.unit ? ' ' + ing.unit : ''} ${ing.name}`;
  }

  function edit() {
    setDraft(draftFromFull(full!));
    router.push('/recipe/edit');
  }

  async function confirmDelete() {
    const accepted = await confirm({ title: 'Delete recipe?', message: 'This also removes it from your meal plan.', confirmLabel: 'Delete recipe', destructive: true });
    if (!accepted) return;
    try {
      await deleteRecipe(recipe);
      router.dismissTo('/(tabs)/recipes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    }
  }

  async function toggleFavorite() {
    if (!session || activityBusy || !activityReady) return;
    setActivityBusy(true);
    try {
      await setRecipeFavorite(session.user.id, recipe.id, !favorite);
      setFavorite(!favorite);
    } catch (e) {
      setActivityError(e instanceof Error ? e.message : 'Could not update favorites.');
    } finally {
      setActivityBusy(false);
    }
  }

  async function markCooked() {
    if (!session || activityBusy || !activityReady) return;
    setActivityBusy(true);
    try {
      await recordRecipeCooked(session.user.id, recipe.id);
      setRecentlyCooked(true);
    } catch (e) {
      setActivityError(e instanceof Error ? e.message : 'Could not update cooking history.');
    } finally {
      setActivityBusy(false);
    }
  }

  async function addToPlan() {
    if (!session) return;
    if (!billing.allowed) { router.push('/premium'); return; }
    const { error: e } = await supabase.from('meal_plan_entries').insert({
      user_id: session.user.id, planned_on: planDate, meal: planMeal, recipe_id: recipe.id, servings: 1,
    });
    if (e) setError(e.message);
    else {
      setSelectedDate(planDate);
      setPlanned(true);
      setPlanning(false);
    }
  }

  const days = Array.from({ length: 14 }, (_, k) => addDays(selectedDate, k));

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Recipe' }} />
      <RecipeImage path={recipe.photo_path} style={{ height: 200, marginBottom: spacing.lg }} />
      <Heading>{recipe.title}</Heading>
      {activityError ? <Notice tone="danger">{activityError}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button title={favorite ? 'Favorited' : 'Add to favorites'} variant="secondary" icon={favorite ? 'heart' : 'heart-outline'} disabled={activityBusy || !activityReady} onPress={() => void toggleFavorite()} />
        <Button title={recentlyCooked ? 'Cooked recently' : 'Mark cooked'} variant="ghost" icon="checkmark-circle-outline" disabled={activityBusy || !activityReady} onPress={() => void markCooked()} />
      </View>
      <Button title={recipe.community_parent_id ? 'Share my variation with members' : 'Share recipe with members'} variant="ghost" onPress={() => router.push({ pathname: '/community/publish', params: { recipeId: recipe.id } })} />
      <Text style={typography.small}>
        {recipe.prep_minutes ? `Prep ${recipe.prep_minutes} min` : ''}
        {recipe.prep_minutes && recipe.cook_minutes ? ' · ' : ''}
        {recipe.cook_minutes ? `Cook ${recipe.cook_minutes} min` : ''}
      </Text>
      {recipe.source_url ? (
        <Pressable onPress={() => Linking.openURL(recipe.source_url!)} accessibilityRole="link" style={{ marginTop: spacing.xs }}>
          <Text style={[typography.small, { color: colors.primary, textDecorationLine: 'underline' }]}>
            Recipe from {recipe.source_name ?? recipe.source_url} · open original
          </Text>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Button title="Start cooking" icon="flame-outline" onPress={() => router.push({ pathname: '/cook/[id]', params: { id: recipe.id, servings: String(servings) } })} disabled={steps.length === 0} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={planned ? 'Planned ✓' : 'Add to plan'} icon="calendar-outline" variant="secondary" onPress={() => {
            if (!billing.allowed) router.push('/premium');
            else setPlanning((p) => !p);
          }} />
        </View>
      </View>
      {steps.length === 0 ? <Body muted>Add steps to use cooking mode.</Body> : null}

      {planning ? (
        <Card>
          <Label>Day</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
            {days.map((dte) => {
              const dt = new Date(dte + 'T00:00:00');
              return <Chip key={dte} label={`${dt.toLocaleDateString(undefined, { weekday: 'short' })} ${dt.getDate()}`} selected={dte === planDate} onPress={() => setPlanDate(dte)} />;
            })}
          </ScrollView>
          <Label>Meal</Label>
          <ChipRow>
            {MEALS.map((m) => <Chip key={m.key} label={m.label} selected={planMeal === m.key} onPress={() => setPlanMeal(m.key)} />)}
          </ChipRow>
          <Button title="Add 1 serving to plan" onPress={addToPlan} />
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={typography.subheading}>Ingredients</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => setServings(Math.max(1, servings - 1))} style={stepBtn} accessibilityLabel="Fewer servings">
              <Ionicons name="remove" size={20} color={colors.primary} />
            </Pressable>
            <Text style={[typography.body, { marginHorizontal: spacing.md, fontWeight: '600' }]}>{servings} serving{servings === 1 ? '' : 's'}</Text>
            <Pressable onPress={() => setServings(Math.min(100, servings + 1))} style={stepBtn} accessibilityLabel="More servings">
              <Ionicons name="add" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>
        {scaled ? <Text style={[typography.small, { marginTop: spacing.xs }]}>Scaled from {recipe.servings} servings. Nutrition below is per serving.</Text> : null}
        <View style={{ height: spacing.sm }} />
        {ingredients.map((ing) => (
          <Text key={ing.id} style={[typography.body, { paddingVertical: 4 }]}>• {ingredientText(ing)}</Text>
        ))}
      </Card>

      <Card>
        <Text style={typography.subheading}>Steps</Text>
        <View style={{ height: spacing.sm }} />
        {steps.length === 0 ? <Body muted>No steps yet.</Body> : null}
        {steps.map((s, i) => (
          <Text key={s.id} style={[typography.body, { paddingVertical: 6 }]}>
            <Text style={{ fontWeight: '700' }}>{i + 1}. </Text>{s.text}
          </Text>
        ))}
      </Card>

      {nutrition.counted > 0 ? (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            {result ? <ScoreBadge score={result.score} rating={result.rating} size={72} /> : null}
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Text style={typography.subheading}>{nutrition.complete ? `${Math.round(nutrition.perServing.calories)} kcal per serving` : 'Partial nutrition estimate'}</Text>
              <Text style={typography.small}>
                Protein {Math.round(nutrition.perServing.protein_g)} g · Carbs {Math.round(nutrition.perServing.carbs_g)} g · Fat {Math.round(nutrition.perServing.fat_g)} g
              </Text>
              {result ? <Text style={[typography.body, { fontWeight: '600', marginTop: 2 }]}>{result.ratingLabel}</Text> : null}
            </View>
          </Card>
          {!nutrition.complete ? <Notice>{recipeNutritionMessage(nutrition)}</Notice> : null}
          <Notice tone="info">
            Nutrition is estimated from ingredient weights and generic USDA data, so treat it as a guide. Recipes are scored as general foods; processing level (NOVA) and additives are unknown for home cooking, so they are left out.
          </Notice>
          {result ? <Disclosure title="Explain score & sources">
            <Body muted>Estimated from matched ingredient weights. Factors are reweighted when source data is unavailable.</Body>
            {result.factors.map((factor) => <FactorCard key={factor.id} factor={factor} totalWeight={totalWeight} />)}
          </Disclosure> : null}
        </>
      ) : (
        <Notice>No nutrition yet. Edit the recipe and tap “Match foods” to calculate nutrition and a health score.</Notice>
      )}

      <Button title="Back to recipes" variant="secondary" icon="arrow-back" onPress={() => router.dismissTo('/(tabs)/recipes')} />
      <Button title="Edit recipe" variant="secondary" icon="create-outline" onPress={edit} />
      <Button title="Delete recipe" variant="danger" icon="trash-outline" onPress={() => void confirmDelete()} />
      <Attribution usda />
    </Screen>
  );
}
