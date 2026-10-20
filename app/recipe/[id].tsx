import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { FactorCard } from '../../src/components/FactorCard';
import { RecipeImage } from '../../src/components/RecipeImage';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { Body, Button, Card, Chip, ChipRow, Heading, Label, Loading, Notice, Screen } from '../../src/components/ui';
import { addDays, defaultMeal, MEALS, toDateString } from '../../src/lib/diary';
import { deleteRecipe, draftFromFull, loadRecipe, type RecipeFull } from '../../src/lib/recipes/db';
import { setDraft } from '../../src/lib/recipes/draft';
import { computeRecipeNutrition, scoreRecipe } from '../../src/lib/recipes/nutrition';
import { formatQuantity, scaleQuantity } from '../../src/lib/recipes/units';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Meal } from '../../src/types';

const stepBtn = { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' } as const;

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [full, setFull] = useState<RecipeFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planDate, setPlanDate] = useState(toDateString(new Date()));
  const [planMeal, setPlanMeal] = useState<Meal>(defaultMeal());
  const [planned, setPlanned] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadRecipe(id)
        .then((f) => {
          setFull(f);
          setServings((cur) => cur ?? f.recipe.servings);
        })
        .catch((e) => setError(e.message));
    }, [id]),
  );

  const nutrition = useMemo(() => (full ? computeRecipeNutrition(full.ingredients, full.recipe.servings) : null), [full]);
  const result = useMemo(() => (full && nutrition && nutrition.counted > 0 ? scoreRecipe(full.recipe.title, nutrition) : null), [full, nutrition]);

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

  function confirmDelete() {
    Alert.alert('Delete recipe?', 'This also removes it from your meal plan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteRecipe(recipe);
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not delete.');
          }
        },
      },
    ]);
  }

  async function addToPlan() {
    if (!session) return;
    const { error: e } = await supabase.from('meal_plan_entries').insert({
      user_id: session.user.id, planned_on: planDate, meal: planMeal, recipe_id: recipe.id, servings: 1,
    });
    if (e) setError(e.message);
    else {
      setPlanned(true);
      setPlanning(false);
    }
  }

  const days = Array.from({ length: 14 }, (_, k) => addDays(toDateString(new Date()), k));

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Recipe' }} />
      <RecipeImage path={recipe.photo_path} style={{ height: 200, marginBottom: spacing.lg }} />
      <Heading>{recipe.title}</Heading>
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
          <Button title={planned ? 'Planned ✓' : 'Add to plan'} icon="calendar-outline" variant="secondary" onPress={() => setPlanning((p) => !p)} />
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
              <Text style={typography.subheading}>{Math.round(nutrition.perServing.calories)} kcal per serving</Text>
              <Text style={typography.small}>
                Protein {Math.round(nutrition.perServing.protein_g)} g · Carbs {Math.round(nutrition.perServing.carbs_g)} g · Fat {Math.round(nutrition.perServing.fat_g)} g
              </Text>
              {result ? <Text style={[typography.body, { fontWeight: '600', marginTop: 2 }]}>{result.ratingLabel}</Text> : null}
            </View>
          </Card>
          {nutrition.excluded > 0 ? (
            <Notice>{nutrition.excluded} ingredient{nutrition.excluded === 1 ? ' is' : 's are'} not counted because they have no nutrition match or weight. Edit the recipe to include them.</Notice>
          ) : null}
          <Notice tone="info">
            Nutrition is estimated from ingredient weights and generic USDA data, so treat it as a guide. Recipes are scored as general foods; processing level (NOVA) and additives are unknown for home cooking, so they are left out.
          </Notice>
          {result?.factors.map((f) => <FactorCard key={f.id} factor={f} totalWeight={totalWeight} />)}
        </>
      ) : (
        <Notice>No nutrition yet. Edit the recipe and tap “Match foods” to calculate nutrition and a health score.</Notice>
      )}

      <Button title="Edit recipe" variant="secondary" icon="create-outline" onPress={edit} />
      <Button title="Delete recipe" variant="danger" icon="trash-outline" onPress={confirmDelete} />
      <Attribution usda />
    </Screen>
  );
}
